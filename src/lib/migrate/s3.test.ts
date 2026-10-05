import { describe, expect, test } from 'bun:test';
import {
  deleteObject,
  getObjectText,
  listObjects,
  objectUrl,
  presignUrl,
  putObject,
  type S3Config,
  signRequest,
} from './s3.ts';
import { noSleep, routeFetch } from './testing/route-fetch.ts';

/** The credentials and date used by every example in the AWS Signature Version 4 docs. */
const AWS_EXAMPLE: S3Config = {
  bucket: 'examplebucket',
  region: 'us-east-1',
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  endpoint: 'https://s3.amazonaws.com',
  forcePathStyle: false,
};
const AWS_EXAMPLE_DATE = new Date('2013-05-24T00:00:00Z');
const EMPTY_SHA256 =
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

const config: S3Config = {
  bucket: 'media',
  region: 'us-west-2',
  accessKeyId: 'AKID',
  secretAccessKey: 'secret',
};
const now = new Date('2026-10-05T12:00:00Z');

function xml(body: string, status = 200) {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n${body}`, {
    status,
    headers: { 'content-type': 'application/xml' },
  });
}

function s3Error(status: number, code: string, message: string) {
  return xml(
    `<Error><Code>${code}</Code><Message>${message}</Message><RequestId>1</RequestId></Error>`,
    status,
  );
}

describe('AWS Signature Version 4 examples', () => {
  test('presigns the documented GET Object query-string example', () => {
    const url = presignUrl(AWS_EXAMPLE, {
      method: 'GET',
      key: 'test.txt',
      expiresSeconds: 86400,
      now: AWS_EXAMPLE_DATE,
    });

    expect(url).toBe(
      'https://examplebucket.s3.amazonaws.com/test.txt' +
        '?X-Amz-Algorithm=AWS4-HMAC-SHA256' +
        '&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request' +
        '&X-Amz-Date=20130524T000000Z' +
        '&X-Amz-Expires=86400' +
        '&X-Amz-SignedHeaders=host' +
        '&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404',
    );
  });

  test('signs the documented GET Object header example', () => {
    const { headers } = signRequest(AWS_EXAMPLE, {
      method: 'GET',
      key: 'test.txt',
      headers: { Range: 'bytes=0-9' },
      payloadHash: EMPTY_SHA256,
      now: AWS_EXAMPLE_DATE,
    });

    expect(headers.authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request,SignedHeaders=host;range;x-amz-content-sha256;x-amz-date,Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41',
    );
    expect(headers['x-amz-date']).toBe('20130524T000000Z');
    expect(headers['x-amz-content-sha256']).toBe(EMPTY_SHA256);
  });

  test('signs the documented PUT Object header example', () => {
    const { url, headers } = signRequest(AWS_EXAMPLE, {
      method: 'PUT',
      key: 'test$file.text',
      headers: {
        Date: 'Fri, 24 May 2013 00:00:00 GMT',
        'x-amz-storage-class': 'REDUCED_REDUNDANCY',
      },
      payloadHash:
        '44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072',
      now: AWS_EXAMPLE_DATE,
    });

    expect(url).toBe('https://examplebucket.s3.amazonaws.com/test%24file.text');
    expect(headers.authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request,SignedHeaders=date;host;x-amz-content-sha256;x-amz-date;x-amz-storage-class,Signature=98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd',
    );
  });

  test('signs the documented GET Bucket (List Objects) header example', () => {
    const { headers } = signRequest(AWS_EXAMPLE, {
      method: 'GET',
      query: { 'max-keys': '2', prefix: 'J' },
      payloadHash: EMPTY_SHA256,
      now: AWS_EXAMPLE_DATE,
    });

    expect(headers.authorization).toEndWith(
      'SignedHeaders=host;x-amz-content-sha256;x-amz-date,Signature=34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7',
    );
  });
});

describe('addressing', () => {
  test('uses virtual-hosted style on AWS by default', () => {
    expect(objectUrl(config, 'videos/intro.mp4')).toBe(
      'https://media.s3.us-west-2.amazonaws.com/videos/intro.mp4',
    );
  });

  test('uses path style with a custom endpoint', () => {
    expect(
      objectUrl(
        {
          ...config,
          region: 'auto',
          endpoint: 'https://account.r2.cloudflarestorage.com/',
        },
        'intro.mp4',
      ),
    ).toBe('https://account.r2.cloudflarestorage.com/media/intro.mp4');
  });

  test('uses virtual-hosted style with a custom endpoint when forcePathStyle is false', () => {
    expect(
      objectUrl(
        {
          ...config,
          endpoint: 'https://storage.googleapis.com',
          forcePathStyle: false,
        },
        'intro.mp4',
      ),
    ).toBe('https://media.storage.googleapis.com/intro.mp4');
  });

  test('encodes each key segment per RFC 3986 and keeps slashes', () => {
    expect(objectUrl(config, "Q1 talks/it's (final)+v2!.mp4")).toBe(
      'https://media.s3.us-west-2.amazonaws.com/Q1%20talks/it%27s%20%28final%29%2Bv2%21.mp4',
    );
  });
});

describe('presignUrl', () => {
  test('includes the session token and caps the expiry at seven days', () => {
    const url = new URL(
      presignUrl(
        { ...config, sessionToken: 'session/token+1' },
        { method: 'GET', key: 'a.mp4', expiresSeconds: 30 * 86400, now },
      ),
    );

    expect(url.searchParams.get('X-Amz-Security-Token')).toBe(
      'session/token+1',
    );
    expect(url.searchParams.get('X-Amz-Expires')).toBe('604800');
    expect(url.searchParams.get('X-Amz-Credential')).toBe(
      'AKID/20261005/us-west-2/s3/aws4_request',
    );
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
  });

  test('signs the content type of a presigned PUT', () => {
    const url = new URL(
      presignUrl(config, {
        method: 'PUT',
        key: 'captions/en.vtt',
        expiresSeconds: 3600,
        contentType: 'text/vtt',
        now,
      }),
    );

    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe(
      'content-type;host',
    );
  });
});

describe('listObjects', () => {
  test('parses ListObjectsV2 results, entity-encoded keys, and the continuation token', async () => {
    const { fetch, requests } = routeFetch({
      'GET media.s3.us-west-2.amazonaws.com/': () =>
        xml(`<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Name>media</Name><Prefix>videos/</Prefix><KeyCount>2</KeyCount><MaxKeys>1000</MaxKeys>
  <IsTruncated>true</IsTruncated>
  <NextContinuationToken>1ueGcxLPRx1Tr/XYExHnhbYLgveDs2J/wm36Hy4vbOwM=</NextContinuationToken>
  <Contents><Key>videos/intro.mp4</Key><LastModified>2024-01-02T03:04:05.000Z</LastModified><ETag>&quot;abc&quot;</ETag><Size>1048576</Size><StorageClass>STANDARD</StorageClass></Contents>
  <Contents><Key>videos/Q&amp;A &lt;live&gt;.mov</Key><LastModified>2024-02-03T04:05:06.000Z</LastModified><Size>42</Size></Contents>
</ListBucketResult>`),
    });

    const page = await listObjects(config, {
      prefix: 'videos/',
      continuationToken: 'previous',
      fetch,
      now,
    });

    expect(page).toEqual({
      objects: [
        {
          key: 'videos/intro.mp4',
          size: 1048576,
          lastModified: '2024-01-02T03:04:05.000Z',
        },
        {
          key: 'videos/Q&A <live>.mov',
          size: 42,
          lastModified: '2024-02-03T04:05:06.000Z',
        },
      ],
      nextContinuationToken: '1ueGcxLPRx1Tr/XYExHnhbYLgveDs2J/wm36Hy4vbOwM=',
    });
    const { url, headers } = requests[0];
    expect(url.searchParams.get('list-type')).toBe('2');
    expect(url.searchParams.get('prefix')).toBe('videos/');
    expect(url.searchParams.get('continuation-token')).toBe('previous');
    expect(headers['x-amz-date']).toBe('20261005T120000Z');
    expect(headers['x-amz-content-sha256']).toBe(EMPTY_SHA256);
    expect(headers.authorization).toStartWith(
      'AWS4-HMAC-SHA256 Credential=AKID/20261005/us-west-2/s3/aws4_request,SignedHeaders=host;x-amz-content-sha256;x-amz-date,Signature=',
    );
  });

  test('returns no continuation token on the last page', async () => {
    const { fetch } = routeFetch({
      'GET /': () =>
        xml(
          '<ListBucketResult><IsTruncated>false</IsTruncated><KeyCount>0</KeyCount></ListBucketResult>',
        ),
    });

    expect(await listObjects(config, { fetch, now })).toEqual({ objects: [] });
  });

  test('lists a custom endpoint by path and signs the session token', async () => {
    const { fetch, requests } = routeFetch({
      'GET minio.local:9000/media': () =>
        xml(
          '<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>',
        ),
    });

    await listObjects(
      {
        ...config,
        endpoint: 'http://minio.local:9000',
        sessionToken: 'token',
      },
      { fetch, now },
    );

    expect(requests[0].headers['x-amz-security-token']).toBe('token');
    expect(requests[0].headers.authorization).toContain(
      'SignedHeaders=host;x-amz-content-sha256;x-amz-date;x-amz-security-token,',
    );
  });

  test.each([
    [403, 'AccessDenied', 'BUCKET_UNAUTHORIZED'],
    [403, 'SignatureDoesNotMatch', 'BUCKET_UNAUTHORIZED'],
    [403, 'InvalidAccessKeyId', 'BUCKET_UNAUTHORIZED'],
    [404, 'NoSuchBucket', 'BUCKET_NOT_FOUND'],
    [400, 'AuthorizationHeaderMalformed', 'BUCKET_HTTP_400'],
  ])('maps HTTP %d %s to %s', async (status, s3Code, code) => {
    const { fetch } = routeFetch({
      'GET /': () => s3Error(status, s3Code, 'Something went wrong'),
    });

    const error = await listObjects(config, { fetch, now }).catch((e) => e);

    expect(error).toMatchObject({ code, status });
    expect(error.message).toContain(s3Code);
    expect(error.message).toContain('Something went wrong');
  });

  test('retries server errors and throttling', async () => {
    let calls = 0;
    const { fetch } = routeFetch({
      'GET /': () => {
        calls++;
        if (calls === 1) return s3Error(503, 'SlowDown', 'Reduce your rate');
        if (calls === 2) return s3Error(500, 'InternalError', 'Try again');
        return xml(
          '<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>',
        );
      },
    });

    await listObjects(config, { fetch, now, sleep: noSleep });

    expect(calls).toBe(3);
  });
});

describe('object requests', () => {
  test('putObject sends a signed body with its hash and content type', async () => {
    const { fetch, requests } = routeFetch({
      'PUT /captions/en.vtt': () => new Response(null, { status: 200 }),
    });

    await putObject(config, {
      key: 'captions/en.vtt',
      body: 'WEBVTT\n',
      contentType: 'text/vtt',
      fetch,
      now,
    });

    const { headers, body } = requests[0];
    expect(body).toBe('WEBVTT\n');
    expect(headers['content-type']).toBe('text/vtt');
    expect(headers['x-amz-content-sha256']).toMatch(/^[0-9a-f]{64}$/);
    expect(headers['x-amz-content-sha256']).not.toBe(EMPTY_SHA256);
    expect(headers.authorization).toContain(
      'SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date,',
    );
  });

  test('deleteObject sends a signed DELETE', async () => {
    const { fetch, requests } = routeFetch({
      'DELETE /captions/en.vtt': () => new Response(null, { status: 204 }),
    });

    await deleteObject(config, { key: 'captions/en.vtt', fetch, now });

    expect(requests[0].headers.authorization).toStartWith('AWS4-HMAC-SHA256');
  });

  test('getObjectText reads an object body and maps a missing key', async () => {
    const { fetch } = routeFetch({
      'GET /meta.json': () => new Response('{"title":"Intro"}'),
      'GET /missing.json': () =>
        s3Error(404, 'NoSuchKey', 'The specified key does not exist.'),
    });

    expect(await getObjectText(config, { key: 'meta.json', fetch, now })).toBe(
      '{"title":"Intro"}',
    );
    expect(
      await getObjectText(config, { key: 'missing.json', fetch, now }).catch(
        (e) => e,
      ),
    ).toMatchObject({ code: 'BUCKET_HTTP_404', status: 404 });
  });
});
