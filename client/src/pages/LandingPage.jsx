import { CallToAction } from '../features/landing/CallToAction.jsx';
import { Faq } from '../features/landing/Faq.jsx';
import { Features } from '../features/landing/Features.jsx';
import { Hero } from '../features/landing/Hero.jsx';
import { HowItWorks } from '../features/landing/HowItWorks.jsx';
import { Pricing } from '../features/landing/Pricing.jsx';

export function LandingPage() {
  return (
    <>
      <title>CloudDrive - secure cloud storage for your files</title>
      <Hero />
      <Features />
      <HowItWorks />
      <Pricing />
      <Faq />
      <CallToAction />
    </>
  );
}
