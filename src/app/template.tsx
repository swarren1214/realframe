/** Re-mounts on every navigation, so each page arrives with a short fade. */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <div className="animate-in fade-in-0 duration-(--duration-base) ease-(--ease-out)">
      {children}
    </div>
  );
}
