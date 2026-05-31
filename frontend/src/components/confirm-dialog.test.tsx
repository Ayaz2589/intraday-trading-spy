import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ConfirmDialog } from "./confirm-dialog";

function setup(overrides: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const utils = render(
    <ConfirmDialog
      open
      title="Delete run"
      message="Delete run r1?"
      confirmLabel="Delete"
      variant="destructive"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...overrides}
    />,
  );
  return { ...utils, onConfirm, onCancel };
}

describe("ConfirmDialog", () => {
  it("renders title, message, and the destructive Confirm + Cancel buttons", () => {
    setup();
    expect(screen.getByText("Delete run")).toBeInTheDocument();
    expect(screen.getByText("Delete run r1?")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^delete$/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("does not render anything when open=false", () => {
    setup({ open: false });
    expect(screen.queryByText("Delete run")).not.toBeInTheDocument();
  });

  it("clicking Confirm calls onConfirm", async () => {
    const { onConfirm } = setup();
    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("clicking Cancel calls onCancel", async () => {
    const { onCancel } = setup();
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("pressing Escape calls onCancel", async () => {
    const { onCancel } = setup();
    await userEvent.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("clicking the backdrop calls onCancel", async () => {
    const { onCancel, container } = setup();
    const backdrop = container.ownerDocument.querySelector(
      ".dialog-backdrop",
    ) as HTMLElement;
    await userEvent.click(backdrop);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("clicking inside the dialog body does not call onCancel", async () => {
    const { onCancel } = setup();
    await userEvent.click(screen.getByText("Delete run r1?"));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("uses role='alertdialog' for screen readers", () => {
    setup();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });
});
