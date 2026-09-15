import { StatusLocal } from "@prisma/client";

export interface IUpdateProfileRequest {
  nomeCompleto?: string;
  username?: string;
  email?: string;
}

export interface IUpdatePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface ICreateUpdateEstabelecimentoRequest {
  localId?: number;
  categoria?: string;
  contatoLocal?: string;
  nomeLocal?: string;
  endereco?: string;
  descricao?: string;
  instagram?: string;
  ativo?: boolean;
  status?: StatusLocal;
  dados_atualizacao?: object | null;
  nomeResponsavel?: string;
  cpfResponsavel?: string;
  latitude?: number;
  longitude?: number;
  logoUrl?: string; 
  produtos?: string[]; 
}