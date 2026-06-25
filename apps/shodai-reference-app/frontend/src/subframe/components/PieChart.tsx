"use client";
/*
 * Documentation:
 * Pie Chart — https://app.subframe.com/345c49081508/library?component=Pie+Chart_0654ccc7-054c-4f3a-8e9a-b7c81dd3963c
 */

import React from "react";
import * as SubframeCore from "@subframe/core";
import * as SubframeUtils from "../utils";

interface PieChartRootProps
  extends React.ComponentProps<typeof SubframeCore.PieChart> {
  className?: string;
}

const PieChartRoot = React.forwardRef<
  React.ElementRef<typeof SubframeCore.PieChart>,
  PieChartRootProps
>(function PieChartRoot({ className, ...otherProps }: PieChartRootProps, ref) {
  return (
    <SubframeCore.PieChart
      className={SubframeUtils.twClassNames("h-52 w-52", className)}
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

export const PieChart = PieChartRoot;
