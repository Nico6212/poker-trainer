import { SiteNav } from '@/components/SiteNav';
import { Table } from '@/components/table/Table';

export const metadata = {
  title: 'Table',
  description:
    'Entraîne-toi contre des bots en NL Hold’em avec la cote du pot et l’équité affichées, et un mode examen pour te tester.',
};

export default function TablePage() {
  return (
    <>
      <SiteNav />
      <Table />
    </>
  );
}
