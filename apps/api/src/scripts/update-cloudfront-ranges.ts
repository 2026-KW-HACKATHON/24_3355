import { writeFile } from "node:fs/promises";

// AWS가 공개하는 IP 대역에서 반복 제한의 클라이언트 IP를 고를 때 쓰는 두 묶음만 뽑아 lib/cloudfront-ranges.json을
// 새로 씁니다(lib/client.ts):
// - cloudfront: service "CLOUDFRONT"(엣지·오리진 쪽 모두)
// - ec2ApNortheast2: service "EC2", region "ap-northeast-2"(Amplify 호스팅의 /api 프록시가 이 대역에서 옴)
// 사용: pnpm --filter @wolgyeham/api ranges:cloudfront   (몇 달에 한 번, 또는 배포 전에)
const SOURCE = "https://ip-ranges.amazonaws.com/ip-ranges.json";
const OUTPUT = new URL("../lib/cloudfront-ranges.json", import.meta.url);

type Prefix = { ip_prefix: string; service: string; region: string };
type Ipv6Prefix = { ipv6_prefix: string; service: string; region: string };
type IpRanges = {
  syncToken: string;
  createDate: string;
  prefixes: Prefix[];
  ipv6_prefixes: Ipv6Prefix[];
};

const response = await fetch(SOURCE);
if (!response.ok) throw new Error(`ip-ranges.json 요청 실패: ${response.status}`);
const data = (await response.json()) as IpRanges;
const unique = (values: string[]) => [...new Set(values)].sort();

function pick(matches: (item: { service: string; region: string }) => boolean) {
  return {
    ipv4Prefixes: unique(data.prefixes.filter(matches).map((item) => item.ip_prefix)),
    ipv6Prefixes: unique(data.ipv6_prefixes.filter(matches).map((item) => item.ipv6_prefix)),
  };
}

const cloudfront = pick((item) => item.service === "CLOUDFRONT");
const ec2ApNortheast2 = pick((item) => item.service === "EC2" && item.region === "ap-northeast-2");
if (cloudfront.ipv4Prefixes.length === 0 || ec2ApNortheast2.ipv4Prefixes.length === 0) {
  throw new Error("대역이 비어 있습니다");
}
const ranges = {
  source: SOURCE,
  syncToken: data.syncToken,
  createDate: data.createDate,
  fetchedAt: new Date().toISOString(),
  cloudfront,
  ec2ApNortheast2,
};
await writeFile(OUTPUT, `${JSON.stringify(ranges, null, 2)}\n`);
console.info(
  `CloudFront IPv4 ${cloudfront.ipv4Prefixes.length}·IPv6 ${cloudfront.ipv6Prefixes.length}, EC2 ap-northeast-2 IPv4 ${ec2ApNortheast2.ipv4Prefixes.length}·IPv6 ${ec2ApNortheast2.ipv6Prefixes.length} (createDate ${data.createDate})`,
);
