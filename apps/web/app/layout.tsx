import type { Metadata } from 'next';
import './globals.css';
import './appearance.css';
import './market.css';
import './navigation.css';
import { AppearanceController } from './appearance';
export const metadata: Metadata = {
  title: 'HouseWorthIt — Find your happy price',
  description: 'See the whole cost of your next home. Explore monthly payments, plan for ownership, and compare your home-buying scenarios.'
};
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: `(function(){var p='system';try{var v=localStorage.getItem('houseworthit-appearance');if(v==='light'||v==='dark')p=v;}catch(e){}var r=document.documentElement;r.dataset.appearance=p;r.dataset.theme=p==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):p;})();` }}/></head><body><AppearanceController/>{children}</body></html>;
}
