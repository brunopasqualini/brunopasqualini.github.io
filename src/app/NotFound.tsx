import { Link } from 'react-router';

export function NotFound() {
  return (
    <div className="page">
      <h1>Nothing here</h1>
      <p className="muted">That page does not exist. Head back to mission control.</p>
      <Link className="btn btn-primary" to="/missions">
        Mission Control
      </Link>
    </div>
  );
}
