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
// 이 서버(Github Mock)의 신원(DID)과 서명 키를 설정합니다.

// (수정) Issuer 1의 고유 비밀 키
const ISSUER_PRIVATE_KEY = '0x0101010101010101010101010101010101010101010101010101010101010101';

// (v6 방식)
// 1. 'SigningKey' 객체를 만듭니다.
//    ethers@v6에서 '.publicKey' 속성을 가진 객체는 'Wallet'이 아니라 'SigningKey'입니다.
const signingKey = new SigningKey(ISSUER_PRIVATE_KEY);

// (v6 방식)
// 2. 'Wallet' 객체를 만듭니다. 이 객체는 서명(signMessage)이나 트랜잭션 전송에 사용됩니다.
//    (참고: did-jwt의 ES256KSigner는 이 Wallet 객체 대신 privateKey 원본을 사용합니다)
const issuerWallet = new Wallet(ISSUER_PRIVATE_KEY);

// (v6 수정) v6에서는 'wallet.publicKey'가 없으므로 (undefined),
// 'signingKey.publicKey'를 사용해 DID를 생성합니다.
// 'z6Mkp'는 이 키가 'secp256k1' 타입임을 나타내는 표준 접두사입니다.
const ISSUER_DID = `did:key:z6Mkp${signingKey.publicKey.substring(4)}`; 

// (v8 방식 - ethers와 독립적)
// 'ES256KSigner'는 ethers 라이브러리와 상관없이, 오직 '비밀 키 원본(raw bytes)'만으로
// 서명기를 만듭니다. (did-jwt v6, v8 모두 이 방식을 지원합니다)
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
console.log(`[Issuer 1: Github Mock] (ESM Mode) 서버가 이 DID로 실행됩니다: ${ISSUER_DID}`);

// ----------------------------------------------------------------
// [ 3. VC 페이로드(내용물) 생성 함수 ]
// ----------------------------------------------------------------
// (Issuer 1의 R&D 성과 VC 로직)

/**
 * R&D 성과 VC의 'credentialSubject' (증명 내용) JSON 객체를 생성합니다.
 * (새 아키텍처) Issuer는 '기준'을 제시하지 않고, 오직 '사실(Fact)'만 증명합니다.
 * @param {string} targetDid - VC를 발급받을 대상(스타트업)의 DID
 * @returns {object} - W3C VC 표준 'credentialSubject'
 */
function createRndVcPayload(targetDid) {
  // 'credentialSubject'는 이 증명서가 "누구의 것인지"(id)와
  // "무엇을 증명하는지"(achievement)를 담습니다.
  const credentialSubject = {
    "id": targetDid, // 이 VC의 소유자(Holder)가 될 스타트업의 DID
    "achievement": {
      "type": "GithubActivity",
      "metric": "Commit Count",
      "period": "2025-10",
      // (새 아키텍처) "criteria" 및 "status" 필드 삭제
      "result": { 
        "value": 142 // 오직 '사실(Fact)'인 142라는 값만 기록
      } 
    }
  };
  return credentialSubject;
}

// ----------------------------------------------------------------
// [ 4. Express 서버 설정 ]
// ----------------------------------------------------------------
// 'express'를 사용해 실제 API 서버의 기본 설정을 합니다.
const app = express();
// (수정) 1번 Issuer 서버는 3001번 포트를 사용
const port = 3001; 
// (중요) express.json() 미들웨어를 설정합니다.
// 이것이 있어야만, 클라이언트가 보낸 JSON 요청(req.body)을 서버가 읽을 수 있습니다.
app.use(express.json());

// 서버 헬스 체크용: http://localhost:3001/ 로 접속 시 응답
app.get('/', (req, res) => {
  res.send('✅ Github Mock Issuer (Issuer 1) is running in ESM Mode!');
});

// ----------------------------------------------------------------
// [ 5. VC 발급 API 엔드포인트 ]
// ----------------------------------------------------------------
// (Issuer 1의 R&D VC 발급 로직)

/**
 * (수정) [POST] /issue-vc (단일 엔드포인트)
 * 클라이언트(Holder)의 DID를 받아서, 서명된 'R&D 성과 VC' (JWT)를 발급합니다.
 */
app.post('/issue-vc', async (req, res) => {
  try {
    // 1. 클라이언트(Holder)가 요청한 JSON 본문(body)에서 'did' 값을 추출합니다.
    const { did } = req.body; 
    if (!did) {
      // 'did' 값이 없으면 400 (Bad Request) 에러 반환
      return res.status(400).json({ error: '요청 바디에 "did"가 필요합니다.' });
    }

    console.log(`[Issuer 1] VC 발급 요청 받음. 대상 DID: ${did}`);

    // 2. VC 내용물(Payload) 전체를 구성합니다.
    const vcPayload = {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      // (수정) 이 VC는 'RndPerformanceCredential' 타입입니다.
      type: ['VerifiableCredential', 'RndPerformanceCredential'],
      issuer: ISSUER_DID,
      issuanceDate: new Date().toISOString(), 
      // (수정) Issuer 1의 VC 생성 함수 호출
      credentialSubject: createRndVcPayload(did),
    };

    // 3. (가장 중요한 단계) VC 서명
    const vcJwt = await createVerifiableCredentialJwt(
      vcPayload,
      issuer // {did, signer} 객체를 전달
    );

    console.log(`[Issuer 1] VC 발급 성공. JWT: ${vcJwt.substring(0, 30)}...`);
    
    // 4. 서명된 VC(JWT)를 클라이언트(스타트업 지갑)에게 200 (OK) 응답으로 전송합니다.
    res.status(200).send(vcJwt);

  } catch (error) {
    console.error('[Issuer 1] VC 발급 중 에러 발생:', error);
    res.status(500).json({ error: error.message });
  }
});


// ----------------------------------------------------------------
// [ 6. 서버 실행 ]
// ----------------------------------------------------------------
app.listen(port, () => {
  console.log(`\n[Issuer 1: Github Mock] (ESM Mode) 서버가 http://localhost:${port} 에서 실행 중입니다.`);
  console.log('VC 발급을 테스트하려면 POST http://localhost:3001/issue-vc 로 요청하세요.');
});