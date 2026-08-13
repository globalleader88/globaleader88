import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  SignUpCommand,
  ConfirmSignUpCommand,
  ResendConfirmationCodeCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  GetUserCommand,
  type AttributeType,
} from '@aws-sdk/client-cognito-identity-provider';
import { createHmac } from 'node:crypto';
import { env } from '@/env';
import { Errors } from '@/lib/errors';
import { logger } from '@/lib/logger';
import type { AuthAdapter, SignInResult, VerifiedIdentity } from './adapter';

/**
 * Production authentication via Amazon Cognito.
 *
 * Uses the USER_PASSWORD_AUTH flow (enable it on the app client) so the server
 * handles credentials over TLS and issues its own sealed session cookie. MFA
 * and NEW_PASSWORD_REQUIRED challenges are surfaced to the caller so the UI can
 * complete them — the architecture is MFA-ready without forcing it on.
 */
export class CognitoAdapter implements AuthAdapter {
  readonly name = 'cognito' as const;
  private readonly client: CognitoIdentityProviderClient;

  constructor() {
    if (!env.COGNITO_CLIENT_ID || !env.COGNITO_USER_POOL_ID) {
      throw Errors.internal('Cognito is not configured');
    }
    this.client = new CognitoIdentityProviderClient({
      region: env.COGNITO_REGION ?? env.AWS_REGION,
    });
  }

  private secretHash(username: string): string | undefined {
    if (!env.COGNITO_CLIENT_SECRET) return undefined;
    return createHmac('sha256', env.COGNITO_CLIENT_SECRET)
      .update(username + env.COGNITO_CLIENT_ID)
      .digest('base64');
  }

  private attr(attrs: AttributeType[] | undefined, name: string): string | undefined {
    return attrs?.find((a) => a.Name === name)?.Value;
  }

  async signIn(email: string, password: string): Promise<SignInResult> {
    const username = email.toLowerCase();
    try {
      const res = await this.client.send(
        new InitiateAuthCommand({
          AuthFlow: 'USER_PASSWORD_AUTH',
          ClientId: env.COGNITO_CLIENT_ID,
          AuthParameters: {
            USERNAME: username,
            PASSWORD: password,
            ...(this.secretHash(username) ? { SECRET_HASH: this.secretHash(username)! } : {}),
          },
        }),
      );

      if (res.ChallengeName === 'SMS_MFA' || res.ChallengeName === 'SOFTWARE_TOKEN_MFA') {
        return { kind: 'challenge', challenge: 'MFA', session: res.Session ?? '' };
      }
      if (res.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
        return {
          kind: 'challenge',
          challenge: 'NEW_PASSWORD_REQUIRED',
          session: res.Session ?? '',
        };
      }

      const accessToken = res.AuthenticationResult?.AccessToken;
      if (!accessToken) throw Errors.unauthenticated('Invalid email or password');

      const user = await this.client.send(new GetUserCommand({ AccessToken: accessToken }));
      const identity: VerifiedIdentity = {
        subject: this.attr(user.UserAttributes, 'sub') ?? username,
        email: this.attr(user.UserAttributes, 'email') ?? username,
        emailVerified: this.attr(user.UserAttributes, 'email_verified') === 'true',
      };
      return { kind: 'authenticated', identity };
    } catch (err) {
      // Do not leak Cognito internals; log server-side only.
      logger.warn('cognito.signIn failed', { action: 'auth.signin', status: 'error' });
      if (err instanceof Error && err.name === 'UserNotConfirmedException') {
        throw Errors.forbidden('Please verify your email before signing in');
      }
      throw Errors.unauthenticated('Invalid email or password');
    }
  }

  async signUp(email: string, password: string, name?: string): Promise<{ subject: string }> {
    const username = email.toLowerCase();
    const res = await this.client.send(
      new SignUpCommand({
        ClientId: env.COGNITO_CLIENT_ID,
        Username: username,
        Password: password,
        ...(this.secretHash(username) ? { SecretHash: this.secretHash(username) } : {}),
        UserAttributes: [
          { Name: 'email', Value: username },
          ...(name ? [{ Name: 'name', Value: name }] : []),
        ],
      }),
    );
    return { subject: res.UserSub ?? username };
  }

  async confirmSignUp(email: string, code: string): Promise<void> {
    const username = email.toLowerCase();
    await this.client.send(
      new ConfirmSignUpCommand({
        ClientId: env.COGNITO_CLIENT_ID,
        Username: username,
        ConfirmationCode: code,
        ...(this.secretHash(username) ? { SecretHash: this.secretHash(username) } : {}),
      }),
    );
  }

  async resendConfirmation(email: string): Promise<void> {
    const username = email.toLowerCase();
    await this.client.send(
      new ResendConfirmationCodeCommand({
        ClientId: env.COGNITO_CLIENT_ID,
        Username: username,
        ...(this.secretHash(username) ? { SecretHash: this.secretHash(username) } : {}),
      }),
    );
  }

  async forgotPassword(email: string): Promise<void> {
    const username = email.toLowerCase();
    await this.client.send(
      new ForgotPasswordCommand({
        ClientId: env.COGNITO_CLIENT_ID,
        Username: username,
        ...(this.secretHash(username) ? { SecretHash: this.secretHash(username) } : {}),
      }),
    );
  }

  async confirmForgotPassword(email: string, code: string, newPassword: string): Promise<void> {
    const username = email.toLowerCase();
    await this.client.send(
      new ConfirmForgotPasswordCommand({
        ClientId: env.COGNITO_CLIENT_ID,
        Username: username,
        ConfirmationCode: code,
        Password: newPassword,
        ...(this.secretHash(username) ? { SecretHash: this.secretHash(username) } : {}),
      }),
    );
  }
}
