"use client";
/*
 * Documentation:
 * Line Chart — https://app.subframe.com/345c49081508/library?component=Line+Chart_22944dd2-3cdd-42fd-913a-1b11a3c1d16d
 */

import React from "react";
import * as SubframeCore from "@subframe/core";
import * as SubframeUtils from "../utils";

interface LineChartRootProps
  extends React.ComponentProps<typeof SubframeCore.LineChart> {
  className?: string;
}

const LineChartRoot = React.forwardRef<
  React.ElementRef<typeof SubframeCore.LineChart>,
  LineChartRootProps
>(function LineChartRoot(
  { className, ...otherProps }: LineChartRootProps,
  ref
) {
  return (
    <SubframeCore.LineChart
      className={SubframeUtils.twClassNames("h-80 w-full", className)}
      ref={ref}
      colors={[
        "#6ae200",
        "#d2fca0",
        "#55b500",
        "#b4f86e",
        "#418c00",
        "#8cee37",
      ]}
      {...otherProps}
    />
  );
});

export const LineChart = LineChartRoot;
