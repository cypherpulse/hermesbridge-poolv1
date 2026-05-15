import { tx } from "@stacks/clarinet-sdk";
import { Cl } from "@stacks/transactions";
import { beforeEach, describe, expect, it } from "vitest";

const contract = "hermesbridgepoolv1";
const accounts = simnet.getAccounts();
const owner = simnet.deployer;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;
const contractPrincipal = `${simnet.deployer}.${contract}`;

beforeEach(() => {
  simnet.setEpoch("3.0");
});

describe("hermesbridgepool", () => {
  it("exposes correct read-only defaults", () => {
    const { result: userDeposit } = simnet.callReadOnlyFn(
      contract,
      "get-user-deposit",
      [Cl.principal(wallet1)],
      wallet1,
    );
    expect(userDeposit).toBeOk(Cl.uint(0));

    const { result: totalDeposited } = simnet.callReadOnlyFn(
      contract,
      "get-total-deposited",
      [],
      wallet1,
    );
    expect(totalDeposited).toBeOk(Cl.uint(0));

    const { result: ownerResult } = simnet.callReadOnlyFn(
      contract,
      "get-owner",
      [],
      wallet1,
    );
    expect(ownerResult).toBeOk(Cl.principal(owner));

    const { result: paused } = simnet.callReadOnlyFn(
      contract,
      "get-paused",
      [],
      wallet1,
    );
    expect(paused).toBeOk(Cl.bool(false));
  });

  it("rejects invalid send-to-route inputs", () => {
    const block = simnet.mineBlock([
      tx.callPublicFn(contract, "send-to-route", [Cl.uint(0)], wallet1),
    ]);
    expect(block[0].result).toBeErr(Cl.uint(101));
  });

  it("records deposits correctly", () => {
    const deposit = simnet.mineBlock([
      tx.callPublicFn(contract, "send-to-route", [Cl.uint(5000)], wallet1),
    ]);

    expect(deposit[0].result).toBeOk(Cl.bool(true));

    const { result: userDeposit } = simnet.callReadOnlyFn(
      contract,
      "get-user-deposit",
      [Cl.principal(wallet1)],
      wallet1,
    );
    expect(userDeposit).toBeOk(Cl.uint(5000));

    const { result: totalDeposited } = simnet.callReadOnlyFn(
      contract,
      "get-total-deposited",
      [],
      wallet1,
    );
    expect(totalDeposited).toBeOk(Cl.uint(5000));
  });

  it("allows multiple deposits and updates total correctly", () => {
    simnet.mineBlock([
      tx.callPublicFn(contract, "send-to-route", [Cl.uint(3000)], wallet1),
      tx.callPublicFn(contract, "send-to-route", [Cl.uint(7000)], wallet1),
      tx.callPublicFn(contract, "send-to-route", [Cl.uint(4000)], wallet2),
    ]);

    const { result: user1Deposit } = simnet.callReadOnlyFn(
      contract,
      "get-user-deposit",
      [Cl.principal(wallet1)],
      wallet1,
    );
    expect(user1Deposit).toBeOk(Cl.uint(10000));

    const { result: totalDeposited } = simnet.callReadOnlyFn(
      contract,
      "get-total-deposited",
      [],
      wallet1,
    );
    expect(totalDeposited).toBeOk(Cl.uint(14000));
  });

  it("allows owner to withdraw specific amount", () => {
    simnet.mineBlock([
      tx.callPublicFn(contract, "send-to-route", [Cl.uint(10000)], wallet1),
    ]);

    const withdraw = simnet.mineBlock([
      tx.callPublicFn(contract, "owner-withdraw", [Cl.uint(4000)], owner),
    ]);

    expect(withdraw[0].result).toBeOk(Cl.bool(true));

    const { result: totalDeposited } = simnet.callReadOnlyFn(
      contract,
      "get-total-deposited",
      [],
      owner,
    );
    expect(totalDeposited).toBeOk(Cl.uint(6000));
  });

  it("allows owner emergency drain of all funds", () => {
    simnet.mineBlock([
      tx.callPublicFn(contract, "send-to-route", [Cl.uint(25000)], wallet2),
    ]);

    const balanceBefore = simnet.getAssetsMap().get("STX")?.get(contractPrincipal) ?? 0n;

    const drain = simnet.mineBlock([
      tx.callPublicFn(contract, "emergency-drain", [], owner),
    ]);

    expect(drain[0].result).toBeOk(Cl.uint(balanceBefore));

    const balanceAfter = simnet.getAssetsMap().get("STX")?.get(contractPrincipal) ?? 0n;
    expect(balanceAfter).toBe(0n);
  });

  it("restricts owner-only functions to owner", () => {
    const withdrawFail = simnet.mineBlock([
      tx.callPublicFn(contract, "owner-withdraw", [Cl.uint(1000)], wallet1),
    ]);
    expect(withdrawFail[0].result).toBeErr(Cl.uint(102));

    const drainFail = simnet.mineBlock([
      tx.callPublicFn(contract, "emergency-drain", [], wallet1),
    ]);
    expect(drainFail[0].result).toBeErr(Cl.uint(102));

    const pauseFail = simnet.mineBlock([
      tx.callPublicFn(contract, "pause", [], wallet1),
    ]);
    expect(pauseFail[0].result).toBeErr(Cl.uint(102));
  });

  it("supports pause and unpause correctly", () => {
    const pause = simnet.mineBlock([
      tx.callPublicFn(contract, "pause", [], owner),
    ]);
    expect(pause[0].result).toBeOk(Cl.bool(true));

    const pausedDeposit = simnet.mineBlock([
      tx.callPublicFn(contract, "send-to-route", [Cl.uint(1000)], wallet1),
    ]);
    expect(pausedDeposit[0].result).toBeErr(Cl.uint(104));

    const unpause = simnet.mineBlock([
      tx.callPublicFn(contract, "unpause", [], owner),
    ]);
    expect(unpause[0].result).toBeOk(Cl.bool(true));

    const depositAfter = simnet.mineBlock([
      tx.callPublicFn(contract, "send-to-route", [Cl.uint(2000)], wallet1),
    ]);
    expect(depositAfter[0].result).toBeOk(Cl.bool(true));
  });

  it("allows owner rotation", () => {
    const setOwner = simnet.mineBlock([
      tx.callPublicFn(contract, "set-owner", [Cl.principal(wallet2)], owner),
    ]);
    expect(setOwner[0].result).toBeOk(Cl.bool(true));

    const oldOwnerPause = simnet.mineBlock([
      tx.callPublicFn(contract, "pause", [], owner),
    ]);
    expect(oldOwnerPause[0].result).toBeErr(Cl.uint(102));

    const newOwnerPause = simnet.mineBlock([
      tx.callPublicFn(contract, "pause", [], wallet2),
    ]);
    expect(newOwnerPause[0].result).toBeOk(Cl.bool(true));
  });
});