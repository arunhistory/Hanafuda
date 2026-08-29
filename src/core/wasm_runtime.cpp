extern "C" {
void* memcpy(void* dst,const void* src,unsigned long n){
  auto* d=static_cast<unsigned char*>(dst);
  const auto* s=static_cast<const unsigned char*>(src);
  for(unsigned long i=0;i<n;i++)d[i]=s[i];
  return dst;
}

void* memmove(void* dst,const void* src,unsigned long n){
  auto* d=static_cast<unsigned char*>(dst);
  const auto* s=static_cast<const unsigned char*>(src);
  if(d<s){for(unsigned long i=0;i<n;i++)d[i]=s[i];}
  else if(d>s){for(unsigned long i=n;i>0;i--)d[i-1]=s[i-1];}
  return dst;
}
}
