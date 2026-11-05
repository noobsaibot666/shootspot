import { Gallery } from '@/components/Gallery';

/** The gallery (D-44). Signed-in members only: the API refuses anyone else and we go to /sign-in. */
export default function Home() {
  return <Gallery />;
}
