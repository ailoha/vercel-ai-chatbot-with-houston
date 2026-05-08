"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export type ConnectionState =
  | "idle"
  | "connecting"
  | "streaming"
  | "retrying"
  | "error"
  | "interrupted"
  | "done";

export type HoustonHandle = {
  setConnectionState: (state: ConnectionState) => void;
  getConnectionState: () => ConnectionState;
};

const POSES = {
  default: "circle half-up circle",
  happy: "half-down half-up half-down",
  disappointed: "half-up bar-bottom half-up",
  shocked: "circle-stroke bar circle-stroke",
  love: "heart half-up heart",
  grumpy: "bar-top half-down bar-top",
  sad: "circle half-down-bottom circle",
  cry: "half-down square half-down",
  wink: "circle half-up bar",
} as const;

type PoseName = keyof typeof POSES;

const EYES = [
  "circle",
  "half-down",
  "circle-small",
  "circle-small",
  "square",
  "circle-stroke",
];
const MOUTHS = [
  "circle-small",
  "square",
  "square-small",
  "bar",
  "circle-small",
  "square-small",
];

const randBetween = (from: number, to: number) =>
  from + Math.floor(Math.random() * to);
const lerp = (start: number, end: number, amt: number) =>
  (1 - amt) * start + amt * end;

type Props = {
  glow?: boolean;
  initialPose?: PoseName;
};

const Houston = forwardRef<HoustonHandle, Props>(function Houston(
  { glow = false, initialPose = "default" },
  ref
) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const eye0Ref = useRef<HTMLDivElement | null>(null);
  const mouthRef = useRef<HTMLDivElement | null>(null);
  const eye1Ref = useRef<HTMLDivElement | null>(null);

  const rectRef = useRef<DOMRect | null>(null);
  const emoteHandle = useRef<number | undefined>(undefined);
  const talkHandle = useRef<number | undefined>(undefined);
  const stateHandle = useRef<number | undefined>(undefined);
  const stateRef = useRef<ConnectionState>("idle");

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    rectRef.current = root.getBoundingClientRect();

    const onResize = () => {
      rectRef.current = root.getBoundingClientRect();
    };
    const onPointerMove = (event: PointerEvent) => {
      const rect = rectRef.current;
      if (!rect) return;
      const x = (event.clientX - rect.x) / rect.width - 0.5;
      const y = (event.clientY - rect.y) / rect.height - 0.5;
      const deltaX = 0 - x;
      const deltaY = 0 - y;
      const rad = Math.atan2(deltaY, deltaX);
      let deg = rad * (180 / Math.PI);
      deg = deg < 0 ? Math.abs(deg) : deg;

      root.style.setProperty("--x", `${x.toPrecision(2)}`);
      root.style.setProperty("--y", `${y.toPrecision(2)}`);
      root.style.setProperty(
        "--deg",
        `${lerp(0, -35, Math.abs(deg / 180))}deg`
      );
    };

    window.addEventListener("resize", onResize);
    root.addEventListener("pointermove", onPointerMove);
    // Apply initial pose shapes
    updateShapes(POSES[initialPose] ?? POSES.default);

    return () => {
      window.removeEventListener("resize", onResize);
      root.removeEventListener("pointermove", onPointerMove);
      if (emoteHandle.current) clearTimeout(emoteHandle.current);
      if (talkHandle.current) clearTimeout(talkHandle.current);
      if (stateHandle.current) clearTimeout(stateHandle.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateShapes(value: string) {
    const [eye0, mouth, eye1] = value.split(" ");
    if (eye0Ref.current) eye0Ref.current.dataset.shape = eye0;
    if (mouthRef.current) mouthRef.current.dataset.shape = mouth;
    if (eye1Ref.current) eye1Ref.current.dataset.shape = eye1;
  }

  function reset() {
    if (emoteHandle.current) {
      clearTimeout(emoteHandle.current);
      emoteHandle.current = undefined;
    }
    stopTalk();
    updateShapes(POSES.default);
  }

  function stopTalk() {
    if (talkHandle.current) {
      clearTimeout(talkHandle.current);
      talkHandle.current = undefined;
    }
  }

  function talk() {
    stopTalk();
    updateShapes(POSES.default);

    let i = 0;
    let pace = randBetween(3, 5);
    const loop = () => {
      i++;
      if (i === pace) {
        const eye = EYES[randBetween(0, EYES.length - 1)];
        if (eye0Ref.current) eye0Ref.current.dataset.shape = eye;
        if (eye1Ref.current) eye1Ref.current.dataset.shape = eye;
        pace = randBetween(3, 5);
        i = 0;
      }
      if (mouthRef.current) {
        mouthRef.current.dataset.shape =
          MOUTHS[randBetween(0, MOUTHS.length - 1)];
      }
      talkHandle.current = window.setTimeout(
        () => loop(),
        randBetween(100, 300)
      );
    };
    loop();
  }

  function setConnectionState(next: ConnectionState) {
    const root = rootRef.current;
    if (!root) return;

    const prev = stateRef.current;
    stateRef.current = next;

    // Once a conversation starts, Houston stays compact permanently
    if (next !== "idle" || root.classList.contains("compact")) {
      root.classList.add("compact");
    }

    root.classList.remove("state-retrying", "state-error", "state-streaming");
    root.dataset.connectionState = next;

    if (prev === "streaming") {
      stopTalk();
    }
    if (prev === "connecting" || prev === "retrying") {
      root.classList.remove("loading");
    }

    if (stateHandle.current) {
      clearTimeout(stateHandle.current);
      stateHandle.current = undefined;
    }

    switch (next) {
      case "idle":
        root.classList.remove("active", "loading");
        reset();
        break;
      case "connecting":
        root.classList.add("active", "loading");
        break;
      case "streaming":
        root.classList.remove("active", "loading");
        root.classList.add("state-streaming");
        talk();
        break;
      case "retrying":
        root.classList.add("active", "loading", "state-retrying");
        updateShapes(POSES.sad);
        break;
      case "error":
        root.classList.remove("active", "loading");
        root.classList.add("state-error");
        updateShapes(POSES.shocked);
        break;
      case "interrupted":
        root.classList.remove("active", "loading");
        updateShapes(POSES.disappointed);
        break;
      case "done":
        root.classList.remove("active", "loading");
        stopTalk();
        updateShapes(POSES.happy);
        stateHandle.current = window.setTimeout(() => {
          stateRef.current = "idle";
          if (rootRef.current)
            rootRef.current.dataset.connectionState = "idle";
          reset();
        }, 1500);
        break;
    }
  }

  useImperativeHandle(
    ref,
    () => ({
      setConnectionState,
      getConnectionState: () => stateRef.current,
    }),
    // setConnectionState and friends only read refs, so the handle never needs to update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return (
    <div
      ref={rootRef}
      className={`hey-houston${glow ? " glow" : ""}`}
      data-pose={initialPose}
    >
      <div className="hh-container">
        <div className="hh-body">
          <div className="hh-face">
            <div className="hh-eye" ref={eye0Ref} data-shape="circle" />
            <div className="hh-mouth" ref={mouthRef} data-shape="half-up" />
            <div className="hh-eye" ref={eye1Ref} data-shape="circle" />
          </div>
        </div>
      </div>
    </div>
  );
});

export default Houston;
