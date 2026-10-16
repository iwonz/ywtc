import * as prompts from '@clack/prompts';

export class WizardCancelledError extends Error {
  constructor() {
    super('Interactive wizard cancelled');
    this.name = 'WizardCancelledError';
  }
}

interface PromptOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
  disabled?: boolean;
}

interface BasePromptOptions {
  id: string;
  message: string;
}

export interface TextPromptOptions extends BasePromptOptions {
  initialValue?: string;
  placeholder?: string;
  validate?: (value: string) => string | undefined;
}

export interface SelectPromptOptions<T extends string> extends BasePromptOptions {
  options: PromptOption<T>[];
  initialValue?: T;
}

export interface WizardPrompter {
  intro(message: string): void;
  outro(message: string): void;
  cancel(message: string): void;
  note(message: string, title?: string): void;
  info(message: string): void;
  success(message: string): void;
  error(message: string): void;
  text(options: TextPromptOptions): Promise<string>;
  password(options: TextPromptOptions): Promise<string>;
  select<T extends string>(options: SelectPromptOptions<T>): Promise<T>;
  task<T>(message: string, action: () => Promise<T>, success: (value: T) => string): Promise<T>;
}

function valueOrCancel<T>(value: T | symbol): T {
  if (prompts.isCancel(value)) throw new WizardCancelledError();
  return value as T;
}

export class ClackPrompter implements WizardPrompter {
  intro(message: string): void { prompts.intro(message); }
  outro(message: string): void { prompts.outro(message); }
  cancel(message: string): void { prompts.cancel(message); }
  note(message: string, title?: string): void { prompts.note(message, title); }
  info(message: string): void { prompts.log.info(message); }
  success(message: string): void { prompts.log.success(message); }
  error(message: string): void { prompts.log.error(message); }

  async text(options: TextPromptOptions): Promise<string> {
    return valueOrCancel<string>(await prompts.text({
      message: options.message,
      ...(options.initialValue !== undefined ? {initialValue: options.initialValue} : {}),
      ...(options.placeholder !== undefined ? {placeholder: options.placeholder} : {}),
      ...(options.validate ? {validate: (value: string | undefined) => options.validate!(value ?? '')} : {}),
    }));
  }

  async password(options: TextPromptOptions): Promise<string> {
    return valueOrCancel<string>(await prompts.password({
      message: options.message,
      mask: '•',
      ...(options.validate ? {validate: (value: string | undefined) => options.validate!(value ?? '')} : {}),
    }));
  }

  async select<T extends string>(options: SelectPromptOptions<T>): Promise<T> {
    const value = valueOrCancel<string>(await prompts.select<string>({
      message: options.message,
      options: options.options.map((option) => ({
        value: option.value,
        label: option.label,
        ...(option.hint !== undefined ? {hint: option.hint} : {}),
        ...(option.disabled !== undefined ? {disabled: option.disabled} : {}),
      })),
      ...(options.initialValue !== undefined ? {initialValue: options.initialValue} : {}),
    }));
    return value as T;
  }

  async task<T>(message: string, action: () => Promise<T>, success: (value: T) => string): Promise<T> {
    const indicator = prompts.spinner();
    indicator.start(message);
    try {
      const value = await action();
      indicator.stop(success(value));
      return value;
    } catch (error) {
      indicator.error(`${message} failed`);
      throw error;
    }
  }
}
