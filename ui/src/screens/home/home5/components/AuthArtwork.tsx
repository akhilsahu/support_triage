import { useEffect, useState } from "react";
import { Pause, Play } from "lucide-react";

/** Flowing-line composition inspired by Kokonut UI's Background Paths on 21st.dev.
 * https://21st.dev/@kokonutd/components/background-paths
 * Original SVG artwork; CSS transforms keep the animation off the React render loop.
 */
export function AuthArtwork() {
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(() => document.hidden);
  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  return (
    <>
      <div
        className="h5-auth-art"
        data-paused={paused || hidden}
        aria-hidden="true"
      >
        <div className="h5-auth-glow" />
        <svg
          className="h5-auth-paths"
          viewBox="0 0 600 800"
          fill="none"
          preserveAspectRatio="xMidYMid slice"
        >
          <g>
            {Array.from({ length: 18 }, (_, i) => (
              <path
                key={i}
                d={`M ${-240 + i * 23} -80 C ${520 + i * 12} 170, ${-280 + i * 23} 430, ${340 + i * 23} 880`}
                stroke="currentColor"
                strokeWidth={i % 4 === 0 ? 1.5 : 0.7}
              />
            ))}
          </g>
        </svg>
      </div>
      <div
        className="h5-auth-illustration"
        data-paused={paused || hidden}
        aria-hidden="true"
      >
        <div className="h5-auth-orbit" />
        <svg className="h5-auth-object" viewBox="0 0 340 290" fill="none">
          <ellipse
            cx="170"
            cy="244"
            rx="110"
            ry="23"
            fill="#24452F"
            fillOpacity=".12"
          />
          <path d="m170 116 121 65-121 66L49 181Z" fill="#57795B" />
          <path d="m49 181 121 66v16L49 197Z" fill="#395F44" />
          <path d="m291 181-121 66v16l121-66Z" fill="#759873" />
          <path
            d="m170 77 110 60-110 61-110-61Z"
            fill="#EAF1DF"
            stroke="#809F7A"
          />
          <path d="m60 137 110 61v16L60 153Z" fill="#B1C7A2" />
          <path d="m280 137-110 61v16l110-61Z" fill="#CFDEBE" />
          <path
            d="m170 27 99 54-99 55-99-55Z"
            fill="#FFFDF7"
            stroke="#8BA980"
          />
          <path d="m71 81 99 55v16L71 97Z" fill="#DBE6CD" />
          <path d="m269 81-99 55v16l99-55Z" fill="#ECF2E1" />
          <path d="m150 64 42 23-30 17-42-23Z" fill="#719569" />
          <path
            d="m161 52 46 25m-9-33 23 13"
            stroke="#719569"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <g fill="#D7AB66">
            <path d="m278 28 5 16 16 5-16 5-5 16-5-16-16-5 16-5Z" />
            <path d="m40 119 4 11 11 4-11 4-4 11-4-11-11-4 11-4Z" />
          </g>
          <circle cx="287" cy="218" r="7" fill="#719569" />
        </svg>
        <span className="h5-auth-art-label">Your knowledge. Connected.</span>
      </div>
      <button
        className="h5-auth-motion"
        type="button"
        aria-label="Pause background motion"
        aria-pressed={paused}
        onClick={() => setPaused(!paused)}
      >
        {paused ? <Play size={13} /> : <Pause size={13} />}
        {paused ? "Motion paused" : "Pause motion"}
      </button>
    </>
  );
}
