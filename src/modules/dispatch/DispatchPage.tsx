import { Layout } from '@/components/layout/Layout';
import { LiveClock } from '@/components/layout/LiveClock';
import Dispatch from '@/modules/production/Dispatch';

export default function DispatchPage() {
  return (
    <Layout>
      <div className="space-y-6 pb-10">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Dispatch</h1>
            <p className="text-muted-foreground mt-1">Manage pending and completed dispatches</p>
          </div>
          <LiveClock />
        </div>
        <Dispatch />
      </div>
    </Layout>
  );
}
