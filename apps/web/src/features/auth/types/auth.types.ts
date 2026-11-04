export interface LoginCredentials {
  email: string;
  password: string;
}

export type LoginFormProps =
  | {
      mode: 'preview';
      onSubmit?: never;
      isLoading?: never;
      error?: never;
    }
  | {
      mode?: 'interactive';
      onSubmit: (credentials: LoginCredentials) => void | Promise<void>;
      isLoading?: boolean;
      error?: string | null;
    };
