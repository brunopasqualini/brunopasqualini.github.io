export const AX = { stroke: '#42557a', fontSize: 10, tickLine: false } as const;
export const TIP = {
  contentStyle: { background: '#0a1224', border: '1px solid #243557', borderRadius: 8, fontSize: 12 },
  labelStyle: { color: '#9fb2d3' },
};

export function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="psec">
      <header>
        <h4>{title}</h4>
        {right}
      </header>
      {children}
    </section>
  );
}
