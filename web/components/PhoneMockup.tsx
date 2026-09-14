import Image from 'next/image';
import React from 'react';

export function PhoneMockup() {
  return (
    <div className="relative mx-auto w-[286px] select-none sm:w-[350px] lg:w-[390px]">
      <div className="absolute -left-14 top-20 z-20 hidden rounded-2xl bg-[#D7F5D8] px-4 py-3 text-xs font-bold text-[#0B2B26] shadow-2xl sm:block">
        100% non-custodial
      </div>
      <div className="absolute -right-14 bottom-24 z-20 hidden rounded-2xl bg-[#D8ECF8] px-4 py-3 text-xs font-bold text-[#0B2B26] shadow-2xl sm:block">
        BTC · ETH · SOL
      </div>
      <div className="relative rotate-[3deg] rounded-[2.5rem] bg-[#11151B] p-2 shadow-[24px_35px_80px_rgba(0,0,0,0.5)] ring-1 ring-white/25 transition-transform duration-500 hover:rotate-0">
        <div className="absolute left-1/2 top-3 z-20 h-6 w-24 -translate-x-1/2 rounded-full bg-black shadow-inner" />
        <div className="relative aspect-[923/2048] overflow-hidden rounded-[2.1rem] bg-white">
          <Image
            src="/app-screenshot.jpg"
            alt="Interface Kalyx Wallet avec le solde et les tokens Bitcoin, Ethereum et Solana"
            fill
            priority
            sizes="(max-width: 640px) 286px, (max-width: 1024px) 350px, 390px"
            className="object-cover object-top"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-white/10 via-transparent to-white/20" />
        </div>
      </div>
      <div className="absolute -top-6 left-1/2 z-30 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-2xl bg-white text-xl font-black text-[#0B2B26] shadow-xl ring-4 ring-[#0B2B26]">
        K
      </div>
    </div>
  );
}
