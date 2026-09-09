/**
 * The stand-in for a face nobody has set yet.
 *
 * Every contacts app draws the same thing: a head above a pair of shoulders,
 * pale on a dark disc, saying "a person, but we don't know which one". This is
 * that silhouette with the brand's own head on it — the toad from the app icon,
 * eyes on top and a level mouth, sitting on the same shoulders.
 *
 * It replaces a "?" in a circle. A question mark reads as an error: the app
 * asking *you* something, or admitting it lost track of who you are. It is
 * shown most often to somebody who has simply not signed in yet, which is not a
 * problem and should not look like one.
 *
 * One flat colour, no features. A silhouette is an outline with nothing inside
 * it, and cutting eyes into one turns the absence of a person into a
 * particular person — which is the opposite of the job.
 *
 * Drawn rather than shipped, on the same 100-unit grid as the icon, so the
 * face in the header and the face on the home screen are provably the same
 * shape and stay that way when either changes.
 */
import React from 'react';
import Svg, { Circle, Ellipse, G, Defs, ClipPath } from 'react-native-svg';
import { colors } from '@/theme';

interface Props {
  size?: number;
  /** The disc behind the silhouette. Defaults to the app's raised card colour. */
  background?: string;
  /** The silhouette itself. Muted on purpose — it is a placeholder, not a face. */
  tint?: string;
}

export function ToadAvatar({ size = 40, background = colors.cardAlt, tint = colors.inkFaint }: Props) {
  // Unique per instance: two of these on one screen sharing a clipPath id would
  // have the second silently adopt the first's geometry.
  const clip = React.useId().replace(/:/g, '');
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityLabel="No profile picture">
      <Circle cx="50" cy="50" r="50" fill={background} />
      <Defs>
        {/* The bust is cropped to the disc, the way a contact silhouette's
            shoulders run off the bottom edge rather than floating inside it. */}
        <ClipPath id={clip}>
          <Circle cx="50" cy="50" r="50" />
        </ClipPath>
      </Defs>
      <G clipPath={`url(#${clip})`}>
        {/* Shoulders: a dome that has to be *wider than the disc* to read as
            shoulders at all. A narrower ellipse intersects the bottom of a
            circle in a lens, which looks like a stray blob rather than a body;
            this one rises to an apex just under the jaw and has filled the full
            width by the time the clip takes over. */}
        <Ellipse cx="50" cy="94" rx="50" ry="28" fill={tint} />
        {/* The head, at the icon's own proportions — eye domes on a wide jaw.
            Large enough that the toad is legible at 28px, which is the size it
            is actually shown at in the header.

            No eyes, no mouth. A silhouette is an outline with nothing inside
            it; the moment features are cut into it, it stops being the absence
            of a person and becomes a particular one. The domes on top of the
            head are what makes this a toad rather than anybody, and they do it
            from the outline alone. */}
        <G transform="translate(50 38) scale(0.62) translate(-50 -50)">
          <Circle cx="30" cy="41" r="19" fill={tint} />
          <Circle cx="70" cy="41" r="19" fill={tint} />
          <Ellipse cx="50" cy="60" rx="41" ry="27" fill={tint} />
        </G>
      </G>
    </Svg>
  );
}
