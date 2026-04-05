/**
 * Scene 1 — THE PAIN (0–240 frames, 8 seconds)
 *
 * Split layout:
 *   Left:  Animated chat window showing AI forgetting context
 *   Right: Bold title + pain statement
 */
import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { C } from "../MMPMVideo";

const MESSAGES = [
  { role: "user",  text: "Remember: TypeScript strict mode. JWT auth with 24h expiry. Hooks only — no class components.",  delay: 20 },
  { role: "ai",    text: "Got it! I'll keep those preferences throughout our session.", delay: 50 },
  { role: "break", text: "— New conversation —", delay: 90 },
  { role: "user",  text: "Help me add auth to the API endpoint we discussed.", delay: 110 },
  { role: "ai",    text: "I'd love to help! Could you remind me of your tech stack and auth requirements? I don't retain context between conversations.", delay: 145, forgotten: true },
];

export const ScenePain: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const containerOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });

  const titleScale = spring({ frame: frame - 10, fps, config: { damping: 120, stiffness: 80 } });
  const titleOpacity = interpolate(frame, [10, 40], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ opacity: containerOpacity }}>
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          padding: "0 80px",
          gap: 80,
        }}
      >
        {/* ── Chat Window ── */}
        <div
          style={{
            flex: "0 0 680px",
            background: "rgba(15,23,42,0.92)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 20,
            overflow: "hidden",
            boxShadow: "0 40px 120px rgba(0,0,0,0.7)",
          }}
        >
          {/* Title bar */}
          <div
            style={{
              background: "rgba(30,41,59,0.9)",
              padding: "16px 24px",
              display: "flex",
              alignItems: "center",
              gap: 8,
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              fontFamily: "monospace",
              fontSize: 13,
              color: "rgba(148,163,184,0.7)",
            }}
          >
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#ef4444" }} />
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#f59e0b" }} />
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#10b981" }} />
            <span style={{ marginLeft: 10 }}>Claude — New Conversation</span>
          </div>

          {/* Messages */}
          <div style={{ padding: "28px 28px 36px", display: "flex", flexDirection: "column", gap: 14 }}>
            {MESSAGES.map((msg, i) => {
              const msgOpacity = interpolate(frame, [msg.delay, msg.delay + 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
              const msgY = interpolate(frame, [msg.delay, msg.delay + 20], [12, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

              if (msg.role === "break") {
                return (
                  <div
                    key={i}
                    style={{
                      opacity: msgOpacity,
                      transform: `translateY(${msgY}px)`,
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      fontFamily: "monospace",
                      fontSize: 11,
                      color: "rgba(100,116,139,0.6)",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      margin: "4px 0",
                    }}
                  >
                    <div style={{ flex: 1, height: 1, background: "rgba(100,116,139,0.15)" }} />
                    {msg.text}
                    <div style={{ flex: 1, height: 1, background: "rgba(100,116,139,0.15)" }} />
                  </div>
                );
              }

              return (
                <div
                  key={i}
                  style={{
                    opacity: msgOpacity,
                    transform: `translateY(${msgY}px)`,
                    display: "flex",
                    gap: 12,
                    alignItems: "flex-start",
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: "monospace",
                      fontSize: 11,
                      fontWeight: 600,
                      flexShrink: 0,
                      background: msg.role === "user"
                        ? "rgba(54,170,245,0.2)"
                        : "rgba(16,185,129,0.15)",
                      color: msg.role === "user" ? C.brand : C.green,
                    }}
                  >
                    {msg.role === "user" ? "You" : "AI"}
                  </div>
                  <div
                    style={{
                      background: msg.forgotten
                        ? "rgba(239,68,68,0.05)"
                        : "rgba(30,41,59,0.7)",
                      border: `1px solid ${msg.forgotten ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.06)"}`,
                      borderRadius: 12,
                      padding: "12px 16px",
                      fontFamily: "sans-serif",
                      fontSize: 15,
                      lineHeight: 1.55,
                      color: msg.forgotten
                        ? "rgba(252,165,165,0.9)"
                        : "rgba(203,213,225,0.9)",
                      maxWidth: 500,
                    }}
                  >
                    {msg.text}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Pain headline ── */}
        <div
          style={{
            flex: 1,
            opacity: titleOpacity,
            transform: `scale(${0.9 + 0.1 * titleScale})`,
          }}
        >
          {/* Badge */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.2)",
              borderRadius: 99,
              padding: "6px 16px",
              fontFamily: "monospace",
              fontSize: 12,
              color: "rgba(252,165,165,0.8)",
              letterSpacing: "0.08em",
              textTransform: "uppercase" as const,
              marginBottom: 24,
            }}
          >
            ⚠ The AI amnesia problem
          </div>

          <h1
            style={{
              fontFamily: "sans-serif",
              fontSize: 68,
              fontWeight: 800,
              color: "white",
              letterSpacing: "-0.035em",
              lineHeight: 1.05,
              margin: "0 0 20px",
            }}
          >
            Every session
            <br />
            starts from
            <br />
            <span style={{ color: C.brand }}>zero.</span>
          </h1>

          <p
            style={{
              fontFamily: "sans-serif",
              fontSize: 22,
              color: "rgba(148,163,184,0.7)",
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            You re-explain. You repaste.
            <br />
            Your AI forgets everything
            <br />
            it learned about you. Every time.
          </p>
        </div>
      </div>
    </AbsoluteFill>
  );
};
