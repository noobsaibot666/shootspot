import type { TagKind, Vocabulary } from '@shootspot/shared';
import { File, Paths } from 'expo-file-system';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { BEST_LIGHT_LABEL, GOOD_FOR_LABEL } from './labels';

/**
 * Live tag lists (D-25): loaded from the API, cached on the phone, falling back to the built-in
 * seed labels when offline. Old records may carry tags that were later hidden: `label()` still
 * names them, they just aren't offered for new captures.
 */
const FALLBACK: Vocabulary = {
  goodFor: Object.entries(GOOD_FOR_LABEL).map(([key, label]) => ({ key, label })),
  bestLight: Object.entries(BEST_LIGHT_LABEL).map(([key, label]) => ({ key, label })),
};
const cache = () => new File(Paths.cache, 'vocabulary.json');

interface VocabCtx {
  vocab: Vocabulary;
  label(kind: TagKind, key: string): string;
}

const Ctx = createContext<VocabCtx | null>(null);

export function VocabularyProvider({ children }: { children: React.ReactNode }) {
  const [vocab, setVocab] = useState<Vocabulary>(FALLBACK);
  const [known, setKnown] = useState<Record<string, string>>({});

  useEffect(() => {
    void (async () => {
      try {
        const f = cache();
        if (f.exists) setVocab(JSON.parse(await f.text()) as Vocabulary);
      } catch {}
      try {
        const live = await api<Vocabulary>('/v1/vocabulary');
        setVocab(live);
        const f = cache();
        if (!f.exists) f.create({ overwrite: true });
        await f.write(JSON.stringify(live));
      } catch {}
    })();
  }, []);

  // Remember every label seen so hidden tags on old records still read well.
  useEffect(() => {
    setKnown((k) => {
      const next = { ...k };
      for (const t of vocab.goodFor) next[`good_for:${t.key}`] = t.label;
      for (const t of vocab.bestLight) next[`best_light:${t.key}`] = t.label;
      return next;
    });
  }, [vocab]);

  const label = useCallback(
    (kind: TagKind, key: string) => {
      const builtIn = kind === 'good_for' ? GOOD_FOR_LABEL[key] : BEST_LIGHT_LABEL[key];
      return (
        known[`${kind}:${key}`] ??
        builtIn ??
        key.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
      );
    },
    [known],
  );

  const value = useMemo(() => ({ vocab, label }), [vocab, label]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useVocabulary(): VocabCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useVocabulary outside VocabularyProvider');
  return c;
}
