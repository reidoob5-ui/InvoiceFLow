import RegisterForm from "./register-form";
export default async function RegisterPage({searchParams}:{searchParams:Promise<{plan?:string}>}){
 const params=await searchParams;const allowed=["free","pro","business"];const selectedPlanKey=params.plan&&allowed.includes(params.plan)?params.plan:"free";
 return <RegisterForm selectedPlanKey={selectedPlanKey}/>;
}