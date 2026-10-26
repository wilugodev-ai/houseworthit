import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'HouseWorthIt — Find your happy price',
  description: 'See the whole cost of your next home. Explore monthly payments, plan for ownership, and compare your home-buying scenarios.'
};
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
