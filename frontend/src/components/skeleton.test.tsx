import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Skeleton } from "./skeleton";

describe("<Skeleton>", () => {
  it("renders with role='presentation' and aria-hidden", () => {
    const { container } = render(<Skeleton />);
    const el = container.firstElementChild as HTMLElement;
    expect(el).not.toBeNull();
    expect(el.getAttribute("role")).toBe("presentation");
    expect(el.getAttribute("aria-hidden")).toBe("true");
  });

  it("applies the .skeleton class for the pulse animation", () => {
    const { container } = render(<Skeleton />);
    expect(container.firstElementChild?.className).toContain("skeleton");
  });

  it("applies width, height, and rounded props", () => {
    const { container } = render(
      <Skeleton width={120} height={18} rounded="pill" />,
    );
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.width).toBe("120px");
    expect(el.style.height).toBe("18px");
    expect(el.style.borderRadius).toBe("var(--r-pill)");
  });

  it("accepts string width values verbatim", () => {
    const { container } = render(<Skeleton width="50%" />);
    expect((container.firstElementChild as HTMLElement).style.width).toBe("50%");
  });
});
