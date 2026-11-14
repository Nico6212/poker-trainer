import { SiteNav } from '@/components/SiteNav';
import { ImportView } from '@/components/import/ImportView';

export const metadata = {
  title: 'Import PokerStars',
  description:
    'Importe tes historiques PokerStars (100 % dans ton navigateur), repère tes erreurs et obtiens ton bilan par session.',
};

export default function ImportPage() {
  return (
    <>
      <SiteNav />
      <ImportView />
    </>
  );
}
