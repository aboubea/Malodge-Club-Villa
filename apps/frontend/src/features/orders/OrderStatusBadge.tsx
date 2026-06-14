import { Badge } from '../../components/ui/Badge';
import { OrderStatus } from '@malodge/shared';

const STATUS_CONFIG: Record<
  OrderStatus,
  { label: string; variant: 'pending' | 'confirmed' | 'manager' | 'completed' | 'cancelled' | 'default' }
> = {
  [OrderStatus.PENDING]: { label: 'En attente', variant: 'pending' },
  [OrderStatus.CONFIRMED]: { label: 'Confirmée', variant: 'confirmed' },
  [OrderStatus.IN_PROGRESS]: { label: 'En cours', variant: 'manager' },
  [OrderStatus.COMPLETED]: { label: 'Terminée', variant: 'completed' },
  [OrderStatus.CANCELLED]: { label: 'Annulée', variant: 'cancelled' },
};

interface OrderStatusBadgeProps {
  status: OrderStatus | string;
  size?: 'sm' | 'md';
}

export function OrderStatusBadge({ status, size = 'sm' }: OrderStatusBadgeProps) {
  const config = STATUS_CONFIG[status as OrderStatus] ?? { label: status, variant: 'default' as 'default' };
  return (
    <Badge variant={config.variant} size={size}>
      {config.label}
    </Badge>
  );
}
