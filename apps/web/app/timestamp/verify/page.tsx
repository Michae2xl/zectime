import {
  resolveProductLocale,
  type ProductSearchParams,
} from "../../../lib/locale";
import { getZkTimestampCopy } from "../../../lib/zk-timestamp";
import { ZkTimestampVerifyPanel } from "../../components/timestamp/zk-timestamp-verify-panel";

interface PageProps {
  searchParams?: ProductSearchParams;
}

export default async function Page({ searchParams }: PageProps) {
  const locale = await resolveProductLocale(searchParams);
  const copy = getZkTimestampCopy(locale);

  return <ZkTimestampVerifyPanel locale={locale} copy={copy} />;
}
