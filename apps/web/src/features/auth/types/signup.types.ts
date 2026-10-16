export interface SignupFormValues {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export type SignupFormProps =
  | {
      mode: 'preview';
      onSubmit?: never;
      isLoading?: never;
      error?: never;
    }
  | {
      mode: 'interactive';
      onSubmit: (values: SignupFormValues) => void | Promise<void>;
      isLoading?: boolean;
      error?: string | null;
    };
