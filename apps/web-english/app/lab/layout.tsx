/**
 * Lab routes share a dark workbench shell; form controls get explicit colors so
 * UA defaults (black on white inputs) never clash with the dark background.
 */
export default function LabLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-zinc-100 [&_input:not([type='checkbox']):not([type='radio'])]:border-zinc-600 [&_input:not([type='checkbox']):not([type='radio'])]:bg-zinc-900 [&_input:not([type='checkbox']):not([type='radio'])]:text-zinc-100 [&_select]:border-zinc-600 [&_select]:bg-zinc-900 [&_select]:text-zinc-100 [&_textarea]:border-zinc-600 [&_textarea]:bg-zinc-900 [&_textarea]:text-zinc-100">
      {children}
    </div>
  );
}
