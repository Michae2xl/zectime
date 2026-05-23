import {
  resolveProductLocale,
  type ProductSearchParams,
} from "../../../lib/locale";
import { getZkTimestampCopy } from "../../../lib/zk-timestamp";
import { ZkTimestampStampPanel } from "../../components/timestamp/zk-timestamp-stamp-panel";

interface PageProps {
  searchParams?: ProductSearchParams;
}

export default async function Page({ searchParams }: PageProps) {
  const locale = await resolveProductLocale(searchParams);
  const copy = getZkTimestampCopy(locale);

  return <ZkTimestampStampPanel locale={locale} copy={copy} />;
}
