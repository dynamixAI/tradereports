import { useState } from 'react';
import type { VatStagger } from '@tradereports/core';
import { saveBusiness, STAGGERS } from './business';
import type { Business } from './files';

// the first step: a couple of quick questions, and the name goes on every report
export function BusinessStep({
  business,
  onDone,
}: {
  business: Business;
  onDone: (business: Business) => void;
}) {
  const [name, setName] = useState(business.name);
  const [stagger, setStagger] = useState<VatStagger>(business.stagger);
  const [touched, setTouched] = useState(false);
  const trimmed = name.trim();
  const missing = trimmed === '';

  const submit = () => {
    setTouched(true);
    if (missing) return;
    const next = { name: trimmed, stagger };
    saveBusiness(next);
    onDone(next);
  };

  return (
    <div className="biz">
      <h1 className="tool-title">Your business</h1>
      <p className="tool-sub">Two quick questions. Your answers stay on this computer.</p>

      <form
        className="card biz-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        noValidate
      >
        <label className="field">
          <span>Business name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="Smith Plumbing and Heating"
            maxLength={80}
            autoComplete="organization"
            aria-invalid={touched && missing ? true : undefined}
            aria-describedby={touched && missing ? 'biz-name-error' : undefined}
            autoFocus
          />
          {/* only shown when the name is left empty */}
          {touched && missing && (
            <span id="biz-name-error" className="field-error">
              Add your business name to carry on.
            </span>
          )}
        </label>

        <label className="field">
          <span>Your VAT quarters end in</span>
          <select
            value={stagger}
            onChange={(e) => setStagger(Number(e.target.value) as VatStagger)}
          >
            {STAGGERS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <span className="field-help">
            Not VAT registered, or not sure? Leave it. You can change it on the report.
          </span>
        </label>

        <div className="biz-actions">
          <button type="submit" className="try">
            Next: add files
          </button>
        </div>
      </form>
    </div>
  );
}
