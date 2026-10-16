/** Page title with a one-line explanation and optional actions on the right. */
export function PageHead(props: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <h1>{props.title}</h1>
        {props.sub && <p>{props.sub}</p>}
      </div>
      {props.children}
    </header>
  );
}
