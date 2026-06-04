import { Badge } from 'react-bootstrap';

export default function LetterStatusBadge({ status }: { status: string }) {
  if (status === 'APPROVED') {
    return <Badge bg="success" style={{ fontSize: '0.72rem' }}>Approved</Badge>;
  }
  if (status === 'REJECTED') {
    return <Badge bg="danger" style={{ fontSize: '0.72rem' }}>Rejected</Badge>;
  }
  return (
    <Badge bg="warning" text="dark" style={{ fontSize: '0.72rem' }}>
      Pending Approval
    </Badge>
  );
}
