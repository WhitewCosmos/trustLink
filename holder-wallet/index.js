// ----------------------------------------------------------------
// [ 1. 라이브러리 임포트 (v6/v8 최신 스택) ]
// ----------------------------------------------------------------

// (ethers@v6) 지갑/키 생성을 위해 'Wallet'과 'SigningKey'를 임포트
import { Wallet, SigningKey } from 'ethers'; 
// (axios) Issuer 서버에 HTTP POST 요청을 보내기 위한 라이브러리
import axios from 'axios';

// (수정) 님이 찾아오신 'did-jwt-vc' (최신)의 "진짜" 검증 함수
// 이 함수가 VC(JWT)를 해독하고, 서명을 검증합니다.
import { verifyCredential } from 'did-jwt-vc'; 

// (수정) 님이 찾아오신 문서를 구현하기 위한 'did-resolver' (최신)
// 'Resolver'는 DID 주소를 실제 'DID 문서'(공개 키 포함)로 변환하는 엔진입니다.
import { Resolver } from 'did-resolver';
// (수정) 'did:key:' 방식을 해석(Resolve)하기 위한 "플러그인"입니다.
import { getResolver as getKeyResolver } from 'key-did-resolver';

// ----------------------------------------------------------------
// [ 2. Holder (스타트업 지갑) 설정 ]
// ----------------------------------------------------------------
// 이 지갑(스타트업)의 고유한 신원(DID)과 서명 키를 설정합니다.

// (수정) 이 지갑(스타트업)의 "고유" 비밀 키입니다. (Issuer들과 달라야 함)
const HOLDER_PRIVATE_KEY = '0x0303030303030303030303030303030303030303030303030303030303030303';

// (v6 방식)
// 1. 'SigningKey' 객체를 만들어 'publicKey'를 확보합니다. (v6 문법)
const signingKey = new SigningKey(HOLDER_PRIVATE_KEY);
// 2. 'Wallet' 객체를 만듭니다. (나중에 3주차 ZKP 서명 시 사용)
const holderWallet = new Wallet(HOLDER_PRIVATE_KEY);

// (v6 방식) 'signingKey.publicKey'를 사용해 Holder의 "고유 DID"를 생성합니다.
// (식별을 위해 접두사를 z6Mkk 로 임의 변경)
const HOLDER_DID = `did:key:z6Mkk${signingKey.publicKey.substring(4)}`; 

console.log(`[Holder Wallet] 이 지갑의 DID: ${HOLDER_DID}`);

// ----------------------------------------------------------------
// [ 3. (수정) DID Resolver 설정 ]
// ----------------------------------------------------------------
// 'Resolver'는 'verifyCredential' 함수가 Issuer의 DID를 검증할 때 사용됩니다.

// 1. 'did:key' 방식 해석기(플러그인)를 가져옵니다.
const keyResolver = getKeyResolver();
// 2. 'Resolver' 엔진에 'keyResolver' 플러그인을 등록합니다.
//    이제 이 'resolver' 객체는 'did:key:...'로 시작하는 DID를 보면
//    'keyResolver'를 사용해 공개 키를 추출할 수 있습니다.
const resolver = new Resolver(keyResolver);

// ----------------------------------------------------------------
// [ 4. Issuer 서버 주소 정의 ]
// ----------------------------------------------------------------
const ISSUER1_URL = 'http://localhost:3001/issue-vc'; // Github Mock (VC 1)
const ISSUER2_GROWTH_URL = 'http://localhost:3002/issue-vc-growth'; // SaaS Mock (VC 2)
const ISSUER2_CONTRACT_URL = 'http://localhost:3002/issue-vc-contract'; // SaaS Mock (VC 3)

// ----------------------------------------------------------------
// [ 5. VC 발급 요청 및 "검증" 함수 ]
// ----------------------------------------------------------------

/**
 * Issuer 서버에 API 요청을 보내 VC(JWT)를 받아옵니다.
 * @param {string} url - 요청할 Issuer의 API 엔드포인트
 * @param {string} did - VC를 발급받을 우리(Holder)의 DID
 * @returns {string} - 서명된 VC (JWT 문자열)
 */
async function requestVc(url, did) {
  try {
    console.log(`\n[Holder] -> ${url} 에 VC 발급 요청...`);
    
    // axios.post(요청URL, 보낼데이터(body))
    // Issuer 서버의 API (예: /issue-vc)로 HTTP POST 요청을 보냅니다.
    // 본문(body)에는 우리 지갑의 DID를 JSON 형태로 담아 보냅니다.
    const response = await axios.post(url, {
      did: did // { "did": "did:key:z6Mkk..." }
    });

    // Issuer가 res.send(vcJwt)로 응답한 데이터(JWT 문자열)를 'vcJwt' 변수에 저장
    const vcJwt = response.data;
    console.log(`[Holder] <- VC 발급 성공! (JWT 수신)`);
    return vcJwt;

  } catch (error) {
    // (중요) 이 부분에서 에러가 난다면, 
    // Issuer 1 (3001) 또는 Issuer 2 (3002) 서버가 꺼져있을 확률이 높습니다.
    console.error(`[Holder] !! ${url} 요청 실패:`, error.message);
    return null;
  }
}

/**
 * (수정) (선택 사항) 님이 찾아오신 'verifyCredential' 함수로 검증합니다.
 * @param {string} vcJwt - 검증할 VC (JWT 문자열)
 */
async function verifyVc(vcJwt) {
  try {
    // (수정) 'verifyCredential' 함수는 VC(JWT)와 'resolver'를 인자로 받습니다.
    // 이 함수가 내부적으로 수행하는 작업 (님이 찾아오신 문서 내용):
    // 1. vcJwt (긴 문자열)를 해독(decode)합니다.
    // 2. 해독된 내용에서 'iss' (발급자)의 DID (예: 'did:key:z6Mkp...')를 찾습니다.
    // 3. 우리가 전달한 'resolver' 객체를 사용해, 그 DID로부터 발급자의 '공개 키'를 추출합니다.
    // 4. 추출된 '공개 키'로 vcJwt의 '디지털 서명'이 유효한지 수학적으로 검증합니다.
    const verifiedVc = await verifyCredential(vcJwt, resolver);
    
    // (수정) 검증에 성공하면, 해독된 VC의 내용(payload)이 반환됩니다.
    // 'verifiedVc.issuer'는 발급자의 DID 문자열입니다. (v7+ API)
    console.log(`[Holder] VC 서명 검증 성공. 발급자: ${verifiedVc.issuer}`);
    return verifiedVc;

  } catch (error) {
    // (오류) 서명이 위조되었거나, resolver가 DID를 해석하지 못하면 여기서 실패합니다.
    console.error(`[Holder] !! VC 검증 실패:`, error.message);
    return null;
  }
}

// ----------------------------------------------------------------
// [ 6. 메인 스크립트 실행 ]
// ----------------------------------------------------------------

// (이 스크립트의 메인 로직)
async function main() {
  console.log('--- 2주차: Holder가 Issuer에게 VC 발급 요청 시작 ---');

  // 1. Issuer 1 (Github)에게 R&D 성과(VC 1) 요청
  const vc1_jwt = await requestVc(ISSUER1_URL, HOLDER_DID);
  if (vc1_jwt) {
    // (수정) 발급받자마자 즉시 '검증' 로직을 실행합니다.
    await verifyVc(vc1_jwt);
    // (임시) VC 1을 '저장' (콘솔에 출력)
    console.log("VC 1 (R&D 성과) JWT:", vc1_jwt, "\n");
  }

  // 2. Issuer 2 (SaaS)에게 플랫폼 성장성(VC 2) 요청
  const vc2_jwt = await requestVc(ISSUER2_GROWTH_URL, HOLDER_DID);
  if (vc2_jwt) {
    // (수정) 발급받자마자 즉시 '검증' 로직을 실행합니다.
    await verifyVc(vc2_jwt);
    // (임시) VC 2를 '저장' (콘솔에 출력)
    console.log("VC 2 (플랫폼 성장성) JWT:", vc2_jwt, "\n");
  }
  
  // 3. Issuer 2 (SaaS)에게 계약 이행(VC 3) 요청
  const vc3_jwt = await requestVc(ISSUER2_CONTRACT_URL, HOLDER_DID);
  if (vc3_jwt) {
    // (수정) 발급받자마자 즉시 '검증' 로직을 실행합니다.
    await verifyVc(vc3_jwt);
    // (임시) VC 3를 '저장' (콘솔에 출력)
    console.log("VC 3 (계약 이행) JWT:", vc3_jwt, "\n");
  }

  console.log('--- 2주차: VC 발급, 수신, "검증"까지 모두 완료. (3주차 ZKP 준비 완료) ---');
}

// 스크립트 실행
main();