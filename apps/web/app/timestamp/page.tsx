import { ZkTimestampHub } from "../components/timestamp/zk-timestamp-hub";
import {
  resolveProductLocale,
  type ProductSearchParams,
} from "../../lib/locale";
import { getZkTimestampCopy } from "../../lib/zk-timestamp";

interface PageProps {
  searchParams?: ProductSearchParams;
}

export default async function Page({ searchParams }: PageProps) {
  const locale = await resolveProductLocale(searchParams);
  const copy = getZkTimestampCopy(locale);

  return <ZkTimestampHub locale={locale} copy={copy} />;
}
