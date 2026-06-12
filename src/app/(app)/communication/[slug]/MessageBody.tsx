"use client";

import Link from "next/link";
import { Fragment, type ReactNode } from "react";

// Rend un corps de message en texte, avec les URLs http(s) cliquables. Les liens
// internes (même origine) passent par <Link> (navigation SPA) ; les externes
// ouvrent un nouvel onglet en rel=noopener. Le texte reste échappé par React.
const URL_SPLIT_RE = /(https?:\/\/[^\s]+)/g;
const URL_TEST_RE = /^https?:\/\//;

function renderUrl(part: string, key: number): ReactNode {
  // Ponctuation finale collée à l'URL (« …/planning/x. ») exclue du lien.
  const match = /[.,;:!?)]+$/.exec(part);
  const trailing = match ? match[0] : "";
  const url = trailing ? part.slice(0, -trailing.length) : part;

  let node: ReactNode;
  try {
    const parsed = new URL(url);
    const sameOrigin =
      typeof window !== "undefined" && parsed.origin === window.location.origin;
    const className = "font-bold text-forest underline underline-offset-2";
    node = sameOrigin ? (
      <Link href={parsed.pathname + parsed.search} className={className}>
        {url}
      </Link>
    ) : (
      <a href={url} target="_blank" rel="noopener noreferrer" className={className}>
        {url}
      </a>
    );
  } catch {
    node = url;
  }

  return (
    <Fragment key={key}>
      {node}
      {trailing}
    </Fragment>
  );
}

export function MessageBody({ body }: { body: string }) {
  const parts = body.split(URL_SPLIT_RE);
  return (
    <p className="whitespace-pre-wrap break-words text-sm text-earth">
      {parts.map((part, i) =>
        URL_TEST_RE.test(part) ? (
          renderUrl(part, i)
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </p>
  );
}
