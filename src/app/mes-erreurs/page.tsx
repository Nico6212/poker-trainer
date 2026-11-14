import { SiteNav } from '@/components/SiteNav';
import { MesErreursView } from '@/components/import/MesErreursView';

export const metadata = {
  title: 'Mes erreurs',
  description:
    'Rejoue tes erreurs importées une par une : déroulé de la main, décision, et répétition espacée pour corriger tes leaks.',
};

export default function MesErreursPage() {
  return (
    <>
      <SiteNav />
      <MesErreursView />
    </>
  );
}
