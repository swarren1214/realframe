/** Fades each account page in; the sidebar in the layout stays put. */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <div className="animate-in fade-in-0 duration-(--duration-base) ease-(--ease-out)">
      {children}
    </div>
  );
}
