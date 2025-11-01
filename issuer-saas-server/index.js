// ----------------------------------------------------------------
// [ 1. 라이브러리 임포트 (Ethers v6 / did-jwt v8 최신 문법) ]
// ----------------------------------------------------------------
// 'import' 구문은 package.json의 "type": "module" (ESM) 방식에서 'require'를 대신합니다.

// Node.js로 HTTP API 서버를 만들기 위한 표준 라이브러리
import express from 'express'; 

// (v6 문법) ethers@v6는 v5와 달리 'Wallet'과 'SigningKey' 클래스를
// 명시적으로 분리했습니다. 둘 다 임포트합니다.
import { Wallet, SigningKey } from 'ethers'; 

// (v8 문법) did-jwt@v8(최신)은 ethers@v6와 호환되며,
// 'ES256KSigner'는 우리가 사용할 이더리움 키 타입(secp256k1)에 맞는 서명기입니다.
import { ES256KSigner } from 'did-jwt'; 
// VC를 JWT 형식으로 생성해주는 핵심 함수입니다.
import { createVerifiableCredentialJwt } from 'did-jwt-vc';

// ----------------------------------------------------------------
// [ 2. Issuer (데이터 제공자) 설정 ]
// ----------------------------------------------------------------
// 이 서버(SaaS Mock)의 신원(DID)과 서명 키를 설정합니다.

// (수정) 이 서버는 'Issuer 1'과 다른 기관이므로, "다른" 비밀 키를 사용합니다.
const ISSUER_PRIVATE_KEY = '0x0202020202020202020202020202020202020202020202020202020202020202';

// (v6 방식)
// 1. 'SigningKey' 객체를 만듭니다.
//    ethers@v6에서 '.publicKey' 속성을 가진 객체는 'Wallet'이 아니라 'SigningKey'입니다.
const signingKey = new SigningKey(ISSUER_PRIVATE_KEY);

// (v6 방식)
// 2. 'Wallet' 객체를 만듭니다. (서명 자체는 아래 ES256KSigner를 사용합니다)
const issuerWallet = new Wallet(ISSUER_PRIVATE_KEY);

// (v6 수정) v6에서는 'wallet.publicKey'가 없으므로 (undefined),
// 'signingKey.publicKey'를 사용해 DID를 생성합니다.
// (식별을 위해 접두사를 z6Mkj 로 임의 변경)
const ISSUER_DID = `did:key:z6Mkj${signingKey.publicKey.substring(4)}`; 

// (v8 방식 - ethers와 독립적)
// 'Signer'는 ethers와 상관없이, 비밀 키 원본(raw bytes)으로 만듭니다.
// 1. '0x' 접두사를 제거합니다.
const privateKeyHex = ISSUER_PRIVATE_KEY.substring(2); 
// 2. 16진수 문자열을 바이트 배열(Buffer)로 변환합니다.
const privateKeyBuffer = Buffer.from(privateKeyHex, 'hex');
// 3. 서명자(Signer) 객체를 생성합니다.
const signer = ES256KSigner(privateKeyBuffer);

// (v8 문법) VC를 생성할 '발급자(issuer)' 정보를 객체로 통합합니다.
// 이 객체는 "누가"(did) "어떻게"(signer) 서명할지를 라이브러리에 알려줍니다.
const issuer = {
  did: ISSUER_DID,
  signer: signer
};

// 서버가 시작될 때, 이 서버가 사용하는 DID를 콘솔에 출력합니다.
console.log(`[Issuer 2: SaaS Mock] (ESM Mode) 서버가 이 DID로 실행됩니다: ${ISSUER_DID}`);

// ----------------------------------------------------------------
// [ 3. (수정) 2가지 종류의 VC 페이로드(내용물) 생성 함수 ]
// ----------------------------------------------------------------

/**
 * VC 2: '플랫폼 성장성 증명서' (SaaS)의 내용물(credentialSubject)을 생성합니다.
 * (새 아키텍처) 'criteria'나 'status' 없이 오직 '사실(value)'만 증명합니다.
 * @param {string} targetDid - VC를 발급받을 대상(스타트업)의 DID
 */
function createPlatformGrowthVcPayload(targetDid) {
  // 1주차에 설계한 VC 2번 모델 (수정됨)
  return {
    "id": targetDid, // 이 VC의 소유자(Holder)가 될 스타트업의 DID
    "achievement": {
      "type": "SaaSActivity",
      "metric": "API Calls",
      "period": "2025-10",
      // (새 아키텍처) "기준"은 없고 "사실"만 기록
      "result": { 
        "value": 11500 // (Mock) 10월 API 호출 수 11,500회
      } 
    }
  };
}

/**
 * VC 3: '계약 이행 증명서' (B2B)의 내용물(credentialSubject)을 생성합니다.
 * (새 아키텍처) 오직 '사실(value)'만 증명합니다.
 * @param {string} targetDid - VC를 발급받을 대상(스타트업)의 DID
 */
function createContractFulfillmentVcPayload(targetDid) {
  // 1주차에 설계한 VC 3번 모델 (수정됨)
  return {
    "id": targetDid, // 이 VC의 소유자(Holder)가 될 스타트업의 DID
    "achievement": {
      "type": "B2BContract",
      "metric": "Contract Fulfillment",
      "period": "2025-10",
      // (새 아키텍처) "기준"은 없고 "사실"만 기록
      "result": { 
        "value": 4 // (Mock) 10월 B2B 계약 4건 이행
      } 
    }
  };
}

// ----------------------------------------------------------------
// [ 4. Express 서버 설정 ]
// ----------------------------------------------------------------
// 'express'를 사용해 실제 API 서버의 기본 설정을 합니다.
const app = express();
// (수정) 'Issuer 1' (3001)과 겹치지 않게 "3002"번 포트를 사용합니다.
const port = 3002; 
// (중요) express.json() 미들웨어를 설정합니다.
// 이것이 있어야만, 클라이언트가 보낸 JSON 요청(req.body)을 서버가 읽을 수 있습니다.
app.use(express.json());

// 서버 헬스 체크용 엔드포인트 (http://localhost:3002/ 로 접속 시)
app.get('/', (req, res) => {
  res.send('✅ SaaS/B2B Mock Issuer (Issuer 2) is running in ESM Mode!');
});

// ----------------------------------------------------------------
// [ 5. (핵심 수정) 2개의 VC 발급 API 엔드포인트 ]
// ----------------------------------------------------------------
// 이 서버는 2종류의 VC를 발급하므로, 2개의 API 경로(endpoint)를 가집니다.

/**
 * [POST] /issue-vc-growth
 * '플랫폼 성장성(API 호출)' VC를 발급합니다.
 */
app.post('/issue-vc-growth', async (req, res) => {
  try {
    // 1. 요청한 사용자의 DID를 받습니다.
    const { did } = req.body; 
    if (!did) {
      return res.status(400).json({ error: '요청 바디에 "did"가 필요합니다.' });
    }
    console.log(`[Issuer 2] '플랫폼 성장성(VC 2)' 발급 요청 받음. 대상 DID: ${did}`);

    // 2. VC 내용물(Payload) 생성
    const vcPayload = {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      // (수정) 이 VC는 'PlatformGrowthCredential' 타입입니다.
      type: ['VerifiableCredential', 'PlatformGrowthCredential'],
      issuer: ISSUER_DID,
      issuanceDate: new Date().toISOString(),
      // (수정) VC 2번 페이로드 생성 함수 호출
      credentialSubject: createPlatformGrowthVcPayload(did),
    };

    // 3. VC 서명 (JWT 형식으로)
    const vcJwt = await createVerifiableCredentialJwt(vcPayload, issuer);

    console.log(`[Issuer 2] '플랫폼 성장성(VC 2)' 발급 성공.`);
    // 4. 서명된 VC(JWT)를 클라이언트(스타트업 지갑)에게 반환
    res.status(200).send(vcJwt);

  } catch (error) {
    console.error('[Issuer 2] VC 발급 중 에러 발생:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * (수정) [POST] /issue-vc-contract
 * '계약 이행(B2B)' VC를 발급합니다.
 */
app.post('/issue-vc-contract', async (req, res) => {
  try {
    // 1. 요청한 사용자의 DID를 받습니다.
    const { did } = req.body;
    if (!did) {
      return res.status(400).json({ error: '요청 바디에 "did"가 필요합니다.' });
    }
    console.log(`[Issuer 2] '계약 이행(VC 3)' 발급 요청 받음. 대상 DID: ${did}`);

    // 2. VC 내용물(Payload) 생성
    const vcPayload = {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      // (수정) 이 VC는 'ContractFulfillmentCredential' 타입입니다.
      type: ['VerifiableCredential', 'ContractFulfillmentCredential'],
      issuer: ISSUER_DID,
      issuanceDate: new Date().toISOString(),
      // (수정) VC 3번 페이로드 생성 함수 호출
      credentialSubject: createContractFulfillmentVcPayload(did),
    };

    // 3. VC 서명 (JWT 형식으로)
    const vcJwt = await createVerifiableCredentialJwt(vcPayload, issuer);

    console.log(`[Issuer 2] '계약 이행(VC 3)' 발급 성공.`);
    // 4. 서명된 VC(JWT)를 클라이언트(스타트업 지갑)에게 반환
    res.status(200).send(vcJwt);

  } catch (error) {
    console.error('[Issuer 2] VC 발급 중 에러 발생:', error);
    res.status(500).json({ error: error.message });
  }
});


// ----------------------------------------------------------------
// [ 6. 서버 실행 ]
// ----------------------------------------------------------------
// 'app.listen' 명령어로 3002번 포트에서 실제 서버 실행을 시작합니다.
app.listen(port, () => {
  console.log(`\n[Issuer 2: SaaS Mock] (ESM Mode) 서버가 http://localhost:${port} 에서 실행 중입니다.`);
  console.log('VC 발급을 테스트하려면 POST http://localhost:3002/issue-vc-growth 또는 /issue-vc-contract 로 요청하세요.');
});