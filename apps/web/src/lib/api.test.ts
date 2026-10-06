import { ERROR_CODES, PublicBuilding } from "@wolgyeham/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getJson } from "./api";
import { AppError, errorMessage, isRetryable } from "./errors";

// 노드의 fetch는 상대 주소를 받지 않아 테스트에서만 절대 주소로 부릅니다.
const URL = "http://localhost/api/buildings/x";

function respond(status: number, body: unknown, contentType = "application/json") {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(typeof body === "string" ? body : JSON.stringify(body), {
          status,
          headers: { "content-type": contentType },
        }),
    ),
  );
}

async function failure(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error("expected the request to fail");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("API client", () => {
  it("parses a response that matches the contract", async () => {
    // Given
    const building = {
      id: "5a3e1c9d-2b47-4f86-9d10-7c2e5b8a4f01",
      name: "햇살빌라",
      displayAddress: "서울 노원구 월계동 OO길",
      status: "open",
    };
    respond(200, building);
    // When
    const result = await getJson(URL, PublicBuilding);
    // Then
    expect(result).toEqual(building);
  });

  it("branches on the error code, not the HTTP status", async () => {
    // Given
    respond(403, { error: { code: "NOT_BUILDING_MANAGER", message: "dev only" } });
    // When
    const error = await failure(getJson(URL, PublicBuilding));
    // Then
    expect(error.code).toBe("NOT_BUILDING_MANAGER");
    expect(isRetryable(error)).toBe(false);
  });

  it("keeps validation fields so the form can show them under each input", async () => {
    // Given
    respond(400, { error: { code: "VALIDATION_FAILED", fields: { title: "Too small" } } });
    // When
    const error = await failure(getJson(URL, PublicBuilding));
    // Then
    expect(error.code).toBe("VALIDATION_FAILED");
    expect(error.fields).toEqual({ title: "Too small" });
  });

  it("treats a response that breaks the contract as an internal error", async () => {
    // Given
    respond(200, { id: "not-a-uuid" });
    // When
    const error = await failure(getJson(URL, PublicBuilding));
    // Then
    expect(error.code).toBe("INTERNAL_ERROR");
    expect(isRetryable(error)).toBe(true);
  });

  it("treats an unknown error body as an internal error", async () => {
    // Given
    respond(502, "Bad Gateway", "text/plain");
    // When
    const error = await failure(getJson(URL, PublicBuilding));
    // Then
    expect(error.code).toBe("INTERNAL_ERROR");
  });

  it("reports a failed connection as NETWORK so the screen can offer a retry", async () => {
    // Given
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    // When
    const error = await failure(getJson(URL, PublicBuilding));
    // Then
    expect(error.code).toBe("NETWORK");
    expect(isRetryable(error)).toBe(true);
  });
});

describe("error copy", () => {
  it("has Korean copy for every contract error code and for NETWORK", () => {
    // Given
    const codes = [...ERROR_CODES, "NETWORK"] as const;
    // When
    const copies = codes.map((code) => errorMessage(new AppError(code)));
    // Then
    for (const copy of copies) expect(copy).toMatch(/[가-힣]/);
  });
});
