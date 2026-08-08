"use client";

import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/**
 * Phase 1D correction pass — a single reusable show/hide control for every
 * password field (login, signup password + confirm, reset password), rather
 * than four separate copies of the same toggle logic. Purely a display
 * concern: toggling `type` between "password"/"text" never touches `value`,
 * so the submitted value is byte-identical either way. Keyboard-accessible
 * (`<button>`, not a `<div>`), with a real, changing `aria-label` rather than
 * an icon-only control with no accessible name.
 */
export function PasswordInput({
  value,
  onChange,
  placeholder,
  required,
  ariaLabel,
  ariaInvalid,
  className,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  required?: boolean;
  ariaLabel?: string;
  ariaInvalid?: boolean;
  className?: string;
}) {
  const [visible, setVisible] = useState(false);
  const inputId = useId();

  return (
    <div className="muv-password-field">
      <input
        id={inputId}
        type={visible ? "text" : "password"}
        required={required}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        aria-label={ariaLabel ?? placeholder}
        aria-invalid={ariaInvalid}
        className={className ?? "muv-input"}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        aria-controls={inputId}
        className="muv-password-toggle"
      >
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}
