import { AbsoluteFill, spring, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import React from 'react';
import { Starfield } from '../components/Starfield';
import { KineticText } from '../components/KineticText';
import { SubText } from '../components/SubText';
import {
  ShopifyLogo, WhatsAppLogo, SlackLogo, DiscordLogo,
  ZendeskLogo, StripeLogo, WordPressLogo, WebhookLogo
} from '../components/IntegrationLogos';

/**
 * Scene10B_Integrations — Omnichannel & Ecosystem Integrations.
 * Features Shopify, WhatsApp, Slack, Discord, Zendesk, Stripe, WordPress & Webhooks.
 */
export const Scene10B_Integrations: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const anim = spring({ frame: frame - 20, fps, config: { damping: 14 } });
  const scale = interpolate(anim, [0, 1], [0.92, 1]);
  const opacity = interpolate(anim, [0, 1], [0, 1]);

  const integrations = [
    { name: 'Shopify', desc: 'Sync Orders, Tracking & Catalog', Logo: ShopifyLogo, badge: 'Live Sync', color: '#95BF47' },
    { name: 'WhatsApp', desc: 'Direct 24/7 Chat & Bot Support', Logo: WhatsAppLogo, badge: 'Active', color: '#25D366' },
    { name: 'Slack', desc: 'Internal Escalation & Bot Alerts', Logo: SlackLogo, badge: 'Connected', color: '#E01E5A' },
    { name: 'Discord', desc: 'Community & Ticket Automation', Logo: DiscordLogo, badge: 'Synced', color: '#5865F2' },
    { name: 'Zendesk', desc: 'Two-Way Ticket & CRM Bridge', Logo: ZendeskLogo, badge: 'Connected', color: '#00A656' },
    { name: 'Stripe', desc: 'Billing, Invoices & Refund Tooling', Logo: StripeLogo, badge: 'Live API', color: '#635BFF' },
    { name: 'WordPress', desc: 'WooCommerce & Website Embed', Logo: WordPressLogo, badge: 'Plugin Ready', color: '#21759B' },
    { name: 'Webhooks & API', desc: 'Custom Endpoints & Event Triggers', Logo: WebhookLogo, badge: 'Instant POST', color: '#F59E0B' },
  ];

  return (
    <AbsoluteFill>
      <Starfield glowColor="rgba(37, 211, 102, 0.08)" />

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        padding: '30px 40px',
        boxSizing: 'border-box',
        gap: '24px',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', textAlign: 'center' }}>
          <KineticText text="Connect Any Platform" delay={0} />
          <SubText text="Omnichannel reach: Shopify, WhatsApp, Slack, Zendesk, Stripe & custom webhooks." delay={15} />
        </div>

        {/* Integration Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '24px',
          maxWidth: '1280px',
          width: '100%',
          transform: `scale(${scale})`,
          opacity,
          boxSizing: 'border-box',
        }}>
          {integrations.map((item, index) => {
            const itemSpring = spring({ frame: frame - 20 - index * 4, fps, config: { damping: 14 } });
            const itemScale = interpolate(itemSpring, [0, 1], [0.85, 1]);
            const itemOpacity = interpolate(itemSpring, [0, 1], [0, 1]);
            const LogoComp = item.Logo;

            return (
              <div
                key={item.name}
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '20px',
                  padding: '18px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  boxShadow: '0 10px 25px rgba(0,0,0,0.03)',
                  transform: `scale(${itemScale})`,
                  opacity: itemOpacity,
                  boxSizing: 'border-box',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{
                    width: '44px', height: '44px', borderRadius: '12px',
                    background: '#f8fafc', border: '1px solid #f1f5f9',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                  }}>
                    <LogoComp size={28} />
                  </div>
                  <div style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: item.color,
                    background: `${item.color}15`,
                    border: `1px solid ${item.color}30`,
                    padding: '3px 8px',
                    borderRadius: '100px',
                  }}>
                    {item.badge}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#1e293b' }}>{item.name}</div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px', lineHeight: 1.4 }}>{item.desc}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
