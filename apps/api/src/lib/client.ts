import { createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import { BlockList, isIP, isIPv4, isIPv6 } from "node:net";
import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";
import awsRanges from "./cloudfront-ranges.json" with { type: "json" };
import type { AppEnv } from "./context.ts";

/** 앞단이 원 서버로 보낼 때 붙이는 비밀 헤더(`ORIGIN_VERIFY_SECRET`). */
export const ORIGIN_VERIFY_HEADER = "X-Origin-Verify";

/** 대역 목록으로 BlockList를 만듭니다. */
function blockListOf(ranges: { ipv4Prefixes: string[]; ipv6Prefixes: string[] }) {
  const list = new BlockList();
  for (const prefix of ranges.ipv4Prefixes) {
    const [network = "", bits = "32"] = prefix.split("/");
    list.addSubnet(network, Number(bits), "ipv4");
  }
  for (const prefix of ranges.ipv6Prefixes) {
    const [network = "", bits = "128"] = prefix.split("/");
    list.addSubnet(network, Number(bits), "ipv6");
  }
  return list;
}

/**
 * AWS ip-ranges.json에서 뽑은 대역(`pnpm --filter @wolgyeham/api ranges:cloudfront`로 갱신, fetchedAt 기록).
 * CloudFront(엣지·오리진 쪽)와 EC2 ap-northeast-2(Amplify 호스팅의 /api 프록시가 이 대역에서 옴).
 */
const cloudfront = blockListOf(awsRanges.cloudfront);
const ec2ApNortheast2 = blockListOf(awsRanges.ec2ApNortheast2);

/** IPv4-mapped IPv6(`::ffff:a.b.c.d`)는 IPv4로 봅니다. */
function plainAddress(address: string): string {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  return mapped?.[1] && isIPv4(mapped[1]) ? mapped[1] : address;
}

function inList(list: BlockList, address: string): boolean {
  const plain = plainAddress(address);
  const family = isIP(plain);
  if (family === 4) return list.check(plain, "ipv4");
  if (family === 6) return list.check(plain, "ipv6");
  return false;
}

export function isCloudFrontAddress(address: string): boolean {
  return inList(cloudfront, address);
}

/** Amplify 호스팅의 /api 프록시가 쓰는 EC2 ap-northeast-2 대역인지. */
export function isAmplifyProxyAddress(address: string): boolean {
  return inList(ec2ApNortheast2, address);
}

/**
 * 비밀 헤더가 맞는(우리 CloudFront를 거친) 요청의 X-Forwarded-For에서 클라이언트를 고릅니다. 실제 dev 체인
 * (`/api/dev/whoami`로 잼):
 * - 우리 CloudFront로 바로: `[클라이언트]` → 마지막 값.
 * - Amplify를 거쳐: `[클라이언트, Amplify의 CloudFront 엣지, Amplify 프록시(EC2 ap-northeast-2)]` → 끝에서 세 번째.
 * 그래서 길이가 3 이상이고 끝에서 두 번째가 CloudFront, 마지막이 EC2 ap-northeast-2일 때만 끝에서 세 번째를,
 * 아니면 마지막 값을 씁니다. 마지막 값은 우리 CloudFront가 붙인 값이라 클라이언트가 꾸밀 수 없습니다(왼쪽에
 * `가짜, <CloudFront 주소>`를 넣어도 마지막은 보낸 사람의 실제 주소). 다만 EC2 ap-northeast-2에서 보내는 사람은
 * 앞의 두 값을 꾸며 요청마다 키를 고를 수 있습니다(로그인하지 않은 건물 전체 상한이 막음). 고른 값이 IP가 아니거나
 * 없으면 undefined(소켓 주소를 씀).
 */
export function pickForwardedClient(chain: string[]): string | undefined {
  const n = chain.length;
  const last = chain[n - 1];
  const edge = chain[n - 2];
  const viaAmplify =
    n >= 3 &&
    edge !== undefined &&
    last !== undefined &&
    isCloudFrontAddress(edge) &&
    isAmplifyProxyAddress(last);
  const candidate = viaAmplify ? chain[n - 3] : last;
  if (!candidate) return undefined;
  const plain = plainAddress(candidate);
  return isIP(plain) ? plain : undefined;
}

function sameSecret(received: string, expected: string): boolean {
  // 길이를 드러내지 않도록 해시끼리 비교합니다.
  const a = createHash("sha256").update(received).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

function socketAddress(c: Context<AppEnv>): string {
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    // app.request()처럼 Node 소켓이 없는 요청(테스트)
    return "unknown";
  }
}

export type ClientAddressInfo = {
  /** 반복 제한에 쓰는 클라이언트 주소. */
  address: string;
  /** `origin-verify`: 비밀 헤더가 맞아 X-Forwarded-For를 믿음, `proxy-hops`: TRUSTED_PROXY_HOPS, `socket`: 소켓 주소. */
  mode: "origin-verify" | "proxy-hops" | "socket";
  originVerify: "matched" | "missing" | "mismatch" | "not_configured";
  forwardedFor: string[];
  socketAddress: string;
};

/**
 * 반복 제한에 쓰는 클라이언트 IP를 정합니다. 주소는 로그에 남기지 않습니다(backend.md §8).
 * - `ORIGIN_VERIFY_SECRET`이 있으면 `X-Origin-Verify`가 맞는 요청에서만 X-Forwarded-For를 믿고, 실제 체인
 *   모양에 맞춰 클라이언트를 고릅니다(`pickForwardedClient`). 헤더가 없거나 틀리면 소켓 주소.
 * - 없고 `TRUSTED_PROXY_HOPS`가 n이면 X-Forwarded-For의 오른쪽에서 n번째 값. 왼쪽 값은 꾸밀 수 있어 믿지 않습니다.
 * - 둘 다 없으면 소켓 주소.
 */
export function resolveClientAddress(c: Context<AppEnv>): ClientAddressInfo {
  const socket = socketAddress(c);
  const forwardedFor = (c.req.header("X-Forwarded-For") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  const secret = c.var.env.ORIGIN_VERIFY_SECRET;
  if (secret) {
    const received = c.req.header(ORIGIN_VERIFY_HEADER);
    const originVerify = !received
      ? "missing"
      : sameSecret(received, secret)
        ? "matched"
        : "mismatch";
    if (originVerify !== "matched") {
      return { address: socket, mode: "socket", originVerify, forwardedFor, socketAddress: socket };
    }
    return {
      address: pickForwardedClient(forwardedFor) ?? socket,
      mode: "origin-verify",
      originVerify,
      forwardedFor,
      socketAddress: socket,
    };
  }
  const hops = c.var.env.TRUSTED_PROXY_HOPS;
  const candidate = hops > 0 ? forwardedFor[forwardedFor.length - hops] : undefined;
  return {
    address: candidate ?? socket,
    mode: candidate ? "proxy-hops" : "socket",
    originVerify: "not_configured",
    forwardedFor,
    socketAddress: socket,
  };
}

export function clientAddress(c: Context<AppEnv>): string {
  return resolveClientAddress(c).address;
}

/** IPv6 주소를 16비트 여덟 칸으로 펼칩니다. 끝에 IPv4가 붙은 형식(`::ffff:192.0.2.1`)도 받습니다. */
function ipv6Hextets(address: string): number[] {
  let text = address;
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (dotted?.[1]) {
    const [a = 0, b = 0, c = 0, d = 0] = dotted[1].split(".").map(Number);
    text = `${text.slice(0, -dotted[1].length)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head = "", tail] = text.split("::");
  const parse = (part: string) =>
    part ? part.split(":").map((value) => Number.parseInt(value, 16)) : [];
  const left = parse(head);
  const right = tail === undefined ? [] : parse(tail);
  return [...left, ...Array<number>(8 - left.length - right.length).fill(0), ...right];
}

/**
 * 반복 제한에서 한 사람으로 볼 주소 묶음. IPv4는 그대로, IPv4-mapped IPv6(`::ffff:a.b.c.d`)는 IPv4로 바꾸고,
 * IPv6는 가정 회선 하나가 보통 받는 /64로 묶습니다(주소를 바꿔 가며 제한을 피하지 못하게).
 */
export function addressGroup(address: string): string {
  const plain = address.split("%")[0] ?? address;
  if (isIPv4(plain) || !isIPv6(plain)) return plain;
  const hextets = ipv6Hextets(plain);
  if (hextets.slice(0, 5).every((value) => value === 0) && hextets[5] === 0xffff) {
    const [high = 0, low = 0] = hextets.slice(6);
    return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
  }
  return `${hextets
    .slice(0, 4)
    .map((value) => value.toString(16))
    .join(":")}::/64`;
}

/** HKDF로 `SESSION_SECRET`에서 IP 키 전용 키를 따로 만듭니다(쿠키 서명 키를 그대로 쓰지 않음). */
const IP_KEY_INFO = "wolgyeham/ip-key/v1";
const derivedIpKeys = new Map<string, Buffer>();
/** `SESSION_SECRET`이 없는 환경(로컬 일부)에서는 프로세스마다 새 키를 씁니다(다시 시작하면 기록이 이어지지 않음). */
const FALLBACK_IP_KEY = randomBytes(32);

export function ipKeySecret(sessionSecret: string | undefined): Buffer {
  if (!sessionSecret) return FALLBACK_IP_KEY;
  let key = derivedIpKeys.get(sessionSecret);
  if (!key) {
    key = Buffer.from(hkdfSync("sha256", sessionSecret, Buffer.alloc(0), IP_KEY_INFO, 32));
    derivedIpKeys.set(sessionSecret, key);
  }
  return key;
}

/**
 * IP 키. 주소 묶음을 HKDF로 만든 키로 HMAC-SHA256한 값이라, DB의 값만으로는 IP를 되돌려 찾기 어렵습니다
 * (database.md §10).
 */
export function ipKey(c: Context<AppEnv>): string {
  const digest = createHmac("sha256", ipKeySecret(c.var.env.SESSION_SECRET))
    .update(addressGroup(clientAddress(c)))
    .digest("hex");
  return `ip:${digest}`;
}

/**
 * 가입코드 시도를 세는 키. 로그인했으면 사용자 키만(IP를 바꿔도 풀리지 않음), 로그인 전이면 IP 키입니다.
 * 건물 전체 상한은 로그인 전(IP 키) 확인에만 씁니다(buildings/service.ts).
 */
export function attemptKeys(c: Context<AppEnv>): string[] {
  return c.var.user ? [`user:${c.var.user.id}`] : [ipKey(c)];
}

/**
 * 제보 반복 제한의 키. 로그인했으면 사용자, 아니면 IP입니다. 브라우저 쿠키·로컬 저장소는 지우면
 * 그만이라 쓰지 않습니다. 통신사 NAT처럼 여러 사람이 IP 하나를 나눠 쓰면 비회원끼리 제한을 함께 받습니다.
 */
export function reportClientKey(c: Context<AppEnv>): string {
  return c.var.user ? `user:${c.var.user.id}` : ipKey(c);
}
