// Aligo REST API 연동 모듈
// 공식문서: https://smartsms.aligo.in/admin/api/spec.html

export async function sendAligoSms(
  receiver: string, // 수신자 전화번호 (예: 01011112222)
  message: string,  // 보낼 메시지 내용
  title?: string    // 메시지 제목 (LMS/MMS인 경우)
): Promise<{ success: boolean; result?: any; error?: string }> {
  // 클라이언트 사이드에서는 API 키 노출 위험이 있으므로, 실제로는 Next.js API Route (/api/sms) 를 거쳐야 하지만
  // 데모 버전 및 간단한 구현을 위해 서버 액션이나 내부 로직에서 직접 호출하도록 작성합니다.
  
  const apiKey = process.env.ALIGO_API_KEY;
  const userId = process.env.ALIGO_USER_ID;
  const sender = process.env.ALIGO_SENDER_PHONE;

  if (!apiKey || !userId || !sender || apiKey.includes('YOUR_')) {
    console.warn('[Aligo] API 키가 설정되지 않아 실제 발송은 생략됩니다.', { receiver, message });
    return { success: true, result: { mock: true } }; // 모의 응답
  }

  try {
    const formData = new URLSearchParams();
    formData.append('key', apiKey);
    formData.append('user_id', userId);
    formData.append('sender', sender);
    formData.append('receiver', receiver);
    formData.append('msg', message);
    if (title) formData.append('title', title);

    const response = await fetch('https://apis.aligo.in/send/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString()
    });

    const data = await response.json();
    
    // resultCode "1" 이면 성공 (알리고 기준)
    if (data.result_code === '1' || data.result_code === 1) {
      return { success: true, result: data };
    } else {
      return { success: false, error: data.message };
    }
  } catch (error: any) {
    console.error('Aligo API Error:', error);
    return { success: false, error: error.message };
  }
}
