import { SiteNav } from '@/components/SiteNav';
import { MesAdversairesView } from '@/components/import/MesAdversairesView';

export const metadata = {
  title: 'Mes adversaires',
  description:
    'Ce que tes adversaires montrent à l’abattage, par action, avec intervalle de Wilson. Calibre les ranges du détecteur d’erreurs. 100 % local.',
};

export default function MesAdversairesPage() {
  return (
    <>
      <SiteNav />
      <MesAdversairesView />
    </>
  );
}
