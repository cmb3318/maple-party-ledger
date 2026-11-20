import { safeImage, validName } from "../../public/model.js";

const recent = new Map();
const minute = 60000;
function allowLookup(ip) {
  const bucket = Math.floor(Date.now() / minute);
  const key = ip || "local";
  const current = recent.get(key);
  if (current?.bucket === bucket && current.count >= 12) return false;
  if (recent.size >= 4096) {
    for (const [address, item] of recent)
      if (item.bucket !== bucket) recent.delete(address);
    if (!current && recent.size >= 4096) return false;
  }
  recent.set(key, {
    bucket,
    count: current?.bucket === bucket ? current.count + 1 : 1,
  });
  return true;
}
function reply(data, status = 200, extra = {}) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extra,
    },
  });
}
function failure(message, status, extra) {
  return reply({ error: message }, status, extra);
}
async function nexon(path, params, key, signal) {
  const url = new URL("/maplestory/v1/" + path, "https://open.api.nexon.com");
  url.search = new URLSearchParams(params);
  const res = await fetch(url, {
    headers: { "x-nxopen-api-key": key },
    signal,
    // Workers supports manual redirect handling. Never forward the API key to a redirect target.
    redirect: "manual",
  });
  if (res.status >= 300 && res.status < 400)
    throw failure("넥슨 조회 주소를 확인 중이에요. 잠시 후 다시 시도해 주세요.", 502);
  if (res.ok) return res.json();
  const body = await res.json().catch(() => ({}));
  const code = body.error?.name;
  if (res.status === 429 || code === "OPENAPI00007")
    throw failure("조회 한도에 도달했어요. 잠시 후 다시 조회해 주세요.", 429, {
      "Retry-After": "60",
    });
  if (res.status === 404 || ["OPENAPI00003", "OPENAPI00004"].includes(code))
    throw failure(
      "캐릭터를 찾을 수 없어요. 이름과 정보 공개 여부를 확인해 주세요.",
      404,
    );
  if (
    ["OPENAPI00002", "OPENAPI00005", "OPENAPI00006"].includes(code) ||
    [401, 403].includes(res.status)
  )
    throw failure(
      "캐릭터 조회 연결을 확인 중이에요. 직접 등록을 이용해 주세요.",
      503,
    );
  throw failure(
    "넥슨에서 정보를 불러올 수 없어요. 잠시 후 다시 시도해 주세요.",
    503,
  );
}
export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== "GET")
    return failure("GET 요청만 지원해요.", 405, { Allow: "GET" });
  const url = new URL(request.url);
  const name = (url.searchParams.get("name") || "").normalize("NFC").trim();
  if (!validName(name))
    return failure("한글, 영문, 숫자 2~12자로 입력해 주세요.", 400);
  if (!env.NEXON_API_KEY)
    return failure(
      "캐릭터 이미지 조회가 아직 연결되지 않았어요. 이름으로 직접 등록할 수 있어요.",
      503,
    );
  const cache = globalThis.caches?.default;
  const cacheURL = new URL("/api/character", url.origin);
  cacheURL.searchParams.set("name", name.toLowerCase());
  try {
    const cached = await cache?.match(cacheURL.href);
    if (cached) return reply(await cached.json());
    if (!allowLookup(request.headers.get("CF-Connecting-IP")))
      return failure("잠시 쉬었다 다시 조회해 주세요.", 429, {
        "Retry-After": "60",
      });
    const signal = AbortSignal.timeout(8000);
    const id = await nexon(
      "id",
      { character_name: name },
      env.NEXON_API_KEY,
      signal,
    );
    if (!id.ocid) return failure("캐릭터 정보를 확인할 수 없어요.", 404);
    const basic = await nexon(
      "character/basic",
      { ocid: id.ocid },
      env.NEXON_API_KEY,
      signal,
    );
    if (!validName(basic.character_name))
      return failure("캐릭터 정보가 아직 준비되지 않았어요.", 503);
    const data = {
      name: basic.character_name,
      world: basic.world_name || "",
      job: basic.character_class || "",
      level: Number(basic.character_level) || null,
      image: safeImage(basic.character_image),
      fetchedAt: Date.now(),
    };
    if (cache)
      context.waitUntil(
        cache
          .put(
            cacheURL.href,
            Response.json(data, {
              headers: { "Cache-Control": "public, max-age=300" },
            }),
          )
          .catch(() => {}),
      );
    return reply(data);
  } catch (err) {
    if (err instanceof Response) return err;
    return failure(
      "조회가 지연되고 있어요. 잠시 후 다시 시도하거나 직접 등록해 주세요.",
      503,
    );
  }
}
