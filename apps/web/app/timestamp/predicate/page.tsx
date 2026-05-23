import {
  resolveProductLocale,
  type ProductSearchParams,
} from "../../../lib/locale";
import { getZkTimestampCopy } from "../../../lib/zk-timestamp";
import { ZkTimestampPredicatePanel } from "../../components/timestamp/zk-timestamp-predicate-panel";

interface PageProps {
  searchParams?: ProductSearchParams;
}

export default async function Page({ searchParams }: PageProps) {
  const locale = await resolveProductLocale(searchParams);
  const copy = getZkTimestampCopy(locale);

  return <ZkTimestampPredicatePanel locale={locale} copy={copy} />;
}
