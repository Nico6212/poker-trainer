import { SiteNav } from '@/components/SiteNav';
import { DrillView } from '@/components/drill/DrillView';

export const metadata = {
  title: 'Drill',
  description:
    'Séries courtes d’automatismes : cote du pot, outs, équité, ranges et « Qu’est-ce qui me bat ? », avec répétition espacée.',
};

export default function DrillPage() {
  return (
    <>
      <SiteNav />
      <DrillView />
    </>
  );
}
