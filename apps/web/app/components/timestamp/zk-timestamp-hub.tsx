import Link from "next/link";

import { withProductLocale } from "../../../lib/locale";
import type { ProductLocale } from "../../../lib/types";
import { type ZkTimestampCopy } from "../../../lib/zk-timestamp";
import { ProductLocaleToggle } from "../locale/product-locale-toggle";

interface ZkTimestampHubProps {
  locale: ProductLocale;
  copy: ZkTimestampCopy;
}

export function ZkTimestampHub({ locale, copy }: ZkTimestampHubProps) {
  return (
    <main className="page-shell product-shell zk-hub-shell zk-timestamp-shell">
      <div className="background-grid" aria-hidden="true" />

      <header className="frame zk-hub-topbar surface-reveal">
        <div className="zk-hub-topbar-brand">
          <p className="eyebrow zk-hub-topbar-eyebrow">
            {copy.shell.brandLine}
          </p>
          <Link
            className="zk-hub-topbar-back"
            href={withProductLocale("/", locale)}
          >
            {copy.shell.backToHub}
          </Link>
        </div>
        <div className="zk-hub-topbar-tools">
          <ProductLocaleToggle
            locale={locale}
            ariaLabel={copy.shell.brandLine}
          />
        </div>
      </header>

      <div className="zk-hub-body">
        <TimestampServiceConsole copy={copy} locale={locale} />
      </div>
    </main>
  );
}

interface SectionProps {
  copy: ZkTimestampCopy;
}

interface HeroProps extends SectionProps {
  locale: ProductLocale;
}

function TimestampServiceConsole({ copy, locale }: HeroProps) {
  return (
    <section
      className="frame zectime-console surface-reveal"
      aria-labelledby="zk-timestamp-hero-title"
    >
      <header className="zectime-console-header">
        <div>
          <p className="eyebrow">{copy.service.brand}</p>
          <h1 id="zk-timestamp-hero-title">{copy.service.title}</h1>
        </div>
      </header>

      <p className="hero-copy zectime-console-body">{copy.service.body}</p>

      <div className="zectime-action-grid">
        <Link
          className="zectime-action-button zectime-action-button-primary"
          href={withProductLocale("/timestamp/stamp", locale)}
          aria-label={`${copy.service.generateTitle}. ${copy.service.generateBody}`}
        >
          <span className="zectime-action-meta">{copy.service.generateMeta}</span>
          <strong>{copy.service.generateTitle}</strong>
        </Link>
        <Link
          className="zectime-action-button zectime-action-button-secondary"
          href={withProductLocale("/timestamp/verify", locale)}
          aria-label={`${copy.service.verifyTitle}. ${copy.service.verifyBody}`}
        >
          <span className="zectime-action-meta">{copy.service.verifyMeta}</span>
          <strong>{copy.service.verifyTitle}</strong>
        </Link>
      </div>

      <ol className="zectime-rails" aria-label={copy.architecture.title}>
        {copy.service.path.map((step, index) => (
          <li key={step}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{step}</strong>
          </li>
        ))}
      </ol>
    </section>
  );
}
